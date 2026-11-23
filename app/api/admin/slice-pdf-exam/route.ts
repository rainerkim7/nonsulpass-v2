/**
 * @file app/api/admin/slice-pdf-exam/route.ts
 * @description 입학처 문항카드 PDF에서 지정한 페이지 범위(「2. 문항 및 제시문」 영역)만 물리적으로 잘라내고,
 *              여러 페이지에 반복 삽입된 학교 로고 배경 워터마크(Image XObject)를 자동 제거해
 *              순수 경량 문제지 PDF를 생성·저장하는 API
 */

import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { PDFDocument, PDFName, PDFDict, PDFRef, PDFRawStream } from 'pdf-lib'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const BUCKET_NAME = 'exam-assets'

// 1x1 완전 투명 PNG (반복 배경 워터마크 XObject 치환용 — 실제 텍스트와 1회성 문제 도표는 100% 보존)
const TRANSPARENT_1X1_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

/**
 * Supabase Storage URL 또는 로컬 public/ 경로의 PDF 바이트 로드
 */
async function loadPdfBytes(pdfUrl: string): Promise<Uint8Array | null> {
  if (!pdfUrl || typeof pdfUrl !== 'string') return null
  const cleanUrl = pdfUrl.split('#')[0].trim()
  if (!cleanUrl) return null

  if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
    const res = await fetch(cleanUrl)
    if (!res.ok) throw new Error(`원본 PDF 다운로드 실패 (HTTP ${res.status})`)
    return new Uint8Array(await res.arrayBuffer())
  }

  if (cleanUrl.startsWith('/')) {
    const localPath = path.normalize(path.join(process.cwd(), 'public', decodeURIComponent(cleanUrl)))
    if (fs.existsSync(localPath)) {
      return new Uint8Array(fs.readFileSync(localPath))
    }
  }
  return null
}

/**
 * PDF 페이지의 Resources -> XObject(중첩 Form XObject 포함)를 재귀 탐색하여
 * 참조된 모든 Image XObject의 PDFRef 태그 목록을 수집
 */
function collectImageXObjectRefs(
  doc: PDFDocument,
  resources: PDFDict | undefined,
  found: Set<string>,
  visitedForms: Set<string>
) {
  if (!resources) return
  const xObjectsRaw = resources.lookup(PDFName.of('XObject'))
  if (!(xObjectsRaw instanceof PDFDict)) return

  for (const [, val] of xObjectsRaw.entries()) {
    if (!(val instanceof PDFRef)) continue
    const refTag = val.toString()
    const obj = doc.context.lookup(val)
    if (!(obj instanceof PDFRawStream)) continue

    const subtype = obj.dict.lookup(PDFName.of('Subtype'))
    if (subtype === PDFName.of('Image')) {
      found.add(refTag)
    } else if (subtype === PDFName.of('Form') && !visitedForms.has(refTag)) {
      visitedForms.add(refTag)
      const formRes = obj.dict.lookup(PDFName.of('Resources'))
      if (formRes instanceof PDFDict) {
        collectImageXObjectRefs(doc, formRes, found, visitedForms)
      }
    }
  }
}

/**
 * 반복 배경 워터마크로 판정된 Image XObject 참조를 1x1 투명 이미지 참조로 치환
 */
function replaceWatermarkXObjects(
  doc: PDFDocument,
  resources: PDFDict | undefined,
  watermarkRefTags: Set<string>,
  transparentRef: PDFRef,
  visitedForms: Set<string>
): number {
  if (!resources) return 0
  const xObjectsRaw = resources.lookup(PDFName.of('XObject'))
  if (!(xObjectsRaw instanceof PDFDict)) return 0

  let replaced = 0
  for (const [key, val] of xObjectsRaw.entries()) {
    if (!(val instanceof PDFRef)) continue
    const refTag = val.toString()

    if (watermarkRefTags.has(refTag)) {
      xObjectsRaw.set(key, transparentRef)
      replaced++
      continue
    }

    const obj = doc.context.lookup(val)
    if (obj instanceof PDFRawStream) {
      const subtype = obj.dict.lookup(PDFName.of('Subtype'))
      if (subtype === PDFName.of('Form') && !visitedForms.has(refTag)) {
        visitedForms.add(refTag)
        const formRes = obj.dict.lookup(PDFName.of('Resources'))
        if (formRes instanceof PDFDict) {
          replaced += replaceWatermarkXObjects(doc, formRes, watermarkRefTags, transparentRef, visitedForms)
        }
      }
    }
  }
  return replaced
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      pdfUrl = '',
      startPage = 1,
      endPage = 1,
      removeWatermark = true,
      univId = 'common',
      fileLabel = 'exam_sliced',
    } = body

    if (!pdfUrl) {
      return NextResponse.json({ success: false, error: '분리할 원본 PDF URL이 없습니다.' }, { status: 400 })
    }

    const srcBytes = await loadPdfBytes(pdfUrl)
    if (!srcBytes) {
      return NextResponse.json({ success: false, error: '원본 PDF 파일을 읽을 수 없습니다.' }, { status: 400 })
    }

    const srcDoc = await PDFDocument.load(srcBytes, { ignoreEncryption: true })
    const totalPages = srcDoc.getPageCount()

    const safeStart = Math.max(1, Math.min(Number(startPage) || 1, totalPages))
    const safeEnd = Math.max(safeStart, Math.min(Number(endPage) || safeStart, totalPages))

    // 1. 반복 배경 워터마크/학교 로고 자동 탐지 (원본 전체 페이지 중 3페이지 이상 동일 참조로 반복되는 Image XObject)
    let removedWatermarksCount = 0
    if (removeWatermark && totalPages >= 3) {
      const pageOccurrenceCount = new Map<string, number>()
      const sampleCount = Math.min(totalPages, 25)

      for (let i = 0; i < sampleCount; i++) {
        const page = srcDoc.getPage(i)
        const res = page.node.Resources()
        const pageImgs = new Set<string>()
        collectImageXObjectRefs(srcDoc, res, pageImgs, new Set<string>())
        pageImgs.forEach((tag) => {
          pageOccurrenceCount.set(tag, (pageOccurrenceCount.get(tag) || 0) + 1)
        })
      }

      // 3페이지 이상 동일 객체로 반복되는 이미지를 배경 워터마크로 판정 (1회성 문제 도표·그림은 절대 건드리지 않음)
      const watermarkRefTags = new Set<string>()
      pageOccurrenceCount.forEach((count, tag) => {
        if (count >= 3) {
          watermarkRefTags.add(tag)
        }
      })

      if (watermarkRefTags.size > 0) {
        const transparentImg = await srcDoc.embedPng(
          Buffer.from(TRANSPARENT_1X1_PNG_BASE64, 'base64')
        )
        const visitedForms = new Set<string>()
        for (let idx = safeStart - 1; idx < safeEnd; idx++) {
          const page = srcDoc.getPage(idx)
          const res = page.node.Resources()
          removedWatermarksCount += replaceWatermarkXObjects(
            srcDoc,
            res,
            watermarkRefTags,
            transparentImg.ref,
            visitedForms
          )
        }
      }
    }

    // 2. 지정된 페이지 범위(safeStart ~ safeEnd)만 새 PDF 문서로 추출
    const outDoc = await PDFDocument.create()
    const targetIndices: number[] = []
    for (let idx = safeStart - 1; idx < safeEnd; idx++) {
      targetIndices.push(idx)
    }

    const copiedPages = await outDoc.copyPages(srcDoc, targetIndices)
    copiedPages.forEach((p) => outDoc.addPage(p))

    const outBytes = await outDoc.save()
    const outBuffer = Buffer.from(outBytes)

    // 3. Supabase Storage ('exam-assets' 버킷) 우선 저장 (upsert: false 적용)
    const safeUnivFolder = String(univId || 'common').replace(/[^a-zA-Z0-9_-]/g, '') || 'common'
    const safeBase = String(fileLabel || 'sliced')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 24)
    const storageFileName = `sliced_${Date.now()}_${safeBase || 'exam'}_p${safeStart}-${safeEnd}.pdf`
    const storagePath = `pdf/${safeUnivFolder}/${storageFileName}`

    const { error: storageErr } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, outBuffer, {
        contentType: 'application/pdf',
        upsert: false,
      })

    if (!storageErr) {
      const { data: publicUrlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(storagePath)

      if (publicUrlData?.publicUrl) {
        return NextResponse.json({
          success: true,
          storage: 'supabase',
          url: publicUrlData.publicUrl,
          fileName: storageFileName,
          startPage: safeStart,
          endPage: safeEnd,
          pageCount: targetIndices.length,
          removedWatermarksCount,
        })
      }
    } else {
      console.warn(`[slice-pdf-exam] Supabase Storage 폴백 (${storageErr.message}) -> 로컬 디스크 시도`)
    }

    // 4. 로컬 개발 환경 스마트 폴백
    try {
      const uploadDir = path.join(process.cwd(), 'public', 'exams', 'pdf', safeUnivFolder)
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true })
      }
      const filePath = path.join(uploadDir, storageFileName)
      fs.writeFileSync(filePath, outBuffer)

      return NextResponse.json({
        success: true,
        storage: 'local',
        url: `/exams/pdf/${safeUnivFolder}/${storageFileName}`,
        fileName: storageFileName,
        startPage: safeStart,
        endPage: safeEnd,
        pageCount: targetIndices.length,
        removedWatermarksCount,
      })
    } catch (fsErr: any) {
      return NextResponse.json(
        {
          success: false,
          error: `분리된 PDF 저장 실패 (Supabase Storage: ${storageErr?.message || fsErr?.message})`,
        },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('[slice-pdf-exam API Error]:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'PDF 페이지 분리 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
