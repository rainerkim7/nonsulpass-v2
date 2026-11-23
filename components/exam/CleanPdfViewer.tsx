'use client'

/**
 * @file components/exam/CleanPdfViewer.tsx
 * @description PDF.js(pdfjs-dist) 기반 순수 흰색 배경·고해상도 캔버스 PDF 뷰어 컴포넌트
 *              - 브라우저 내장 PDF 뷰어의 어두운 회색 배경·상단 툴바·좌측 썸네일 창을 완전히 제거
 *              - 배경·페이지 간격·스크롤 여백을 100% 순수 흰색(#ffffff)으로 통일
 *              - 기본 110% 가로폭 맞춤 및 ±5% 네이티브 고해상도 벡터 확대/축소 지원
 */

import React, { useEffect, useRef, useState } from 'react'
import { Loader2, AlertTriangle, ExternalLink } from 'lucide-react'

interface CleanPdfViewerProps {
  /** 표시할 PDF URL (Supabase Storage Public URL 또는 로컬 /exams/pdf/... 경로) */
  url: string
  /** 통합 PDF 사용 시 초기 자동 스크롤할 시작 페이지 번호 (1부터 시작) */
  startPage?: number
  /** 문항 전환 감지용 식별 키 (예: q1, q2, q3 — 탭 클릭 시 항상 해당 페이지 최상단으로 이동) */
  questionKey?: string
  /** 현재 배율 (기본값: 110 — 110% 기준 가로폭 맞춤, ±5% 단위 증감) */
  zoom?: number
  /** 기준 배율 (이 배율일 때 컨테이너 가로폭에 딱 맞게 렌더링, 기본 110) */
  baseZoom?: number
}

export default function CleanPdfViewer({
  url,
  startPage = 1,
  questionKey,
  zoom = 110,
  baseZoom = 110,
}: CleanPdfViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const pageRefs = useRef<Array<HTMLDivElement | null>>([])
  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([])

  const [pdfDoc, setPdfDoc] = useState<any>(null)
  const [numPages, setNumPages] = useState<number>(0)
  const [containerWidth, setContainerWidth] = useState<number>(0)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isPagesReady, setIsPagesReady] = useState<boolean>(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const hasScrolledToStartRef = useRef<boolean>(false)

  // 1. 컨테이너 실제 가로 폭 감지 (미세한 스크롤바 폭 변화 12px 미만은 무시해 이중 렌더링 방지)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const updateWidth = () => {
      const w = el.clientWidth
      if (w > 0) {
        setContainerWidth((prev) => (prev === 0 || Math.abs(prev - w) >= 12 ? w : prev))
      }
    }
    updateWidth()

    const observer = new ResizeObserver(() => {
      updateWidth()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // 2. PDF 문서 로드 (클라이언트 전용 동적 import로 Next.js SSR 충돌 방지)
  useEffect(() => {
    let isCancelled = false
    let loadedDoc: any = null

    async function loadPdf() {
      if (!url) return
      setIsLoading(true)
      setIsPagesReady(false)
      setErrorMsg(null)
      setPdfDoc(null)
      setNumPages(0)
      hasScrolledToStartRef.current = false

      try {
        const pdfjsLib = await import('pdfjs-dist')
        // public/pdf.worker.min.mjs 로컬 워커 사용 (CDN 의존성·CORS 오류 원천 차단)
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

        const cleanUrl = url.split('#')[0]
        const loadingTask = pdfjsLib.getDocument({
          url: cleanUrl,
          cMapPacked: true,
        })

        loadedDoc = await loadingTask.promise
        if (isCancelled) {
          loadedDoc.destroy()
          return
        }

        setPdfDoc(loadedDoc)
        setNumPages(loadedDoc.numPages || 0)
      } catch (err: any) {
        if (!isCancelled) {
          console.error('[CleanPdfViewer] PDF 로드 오류:', err)
          setErrorMsg('PDF 문서를 불러오는 중 오류가 발생했습니다.')
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    loadPdf()

    return () => {
      isCancelled = true
      if (loadedDoc) {
        try {
          loadedDoc.destroy()
        } catch {}
      }
    }
  }, [url])

  // 3. 모든 페이지 고해상도 캔버스 렌더링 (startPage 변경 시에는 재렌더링하지 않고 스크롤만 이동)
  useEffect(() => {
    if (!pdfDoc || numPages === 0 || containerWidth <= 0) return

    let isCancelled = false
    const renderTasks: any[] = []

    // 배율 변경 전 현재 보고 있던 세로 중심 비율 저장 (확대/축소 시 읽던 위치 유지용)
    const scrollEl = containerRef.current
    const prevScrollHeight = scrollEl ? scrollEl.scrollHeight : 0
    const prevCenterYRatio =
      scrollEl && prevScrollHeight > scrollEl.clientHeight
        ? (scrollEl.scrollTop + scrollEl.clientHeight / 2) / prevScrollHeight
        : null

    async function renderAllPages() {
      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2.5) : 1
      // 스크롤바 및 최소 여백을 제외한 순수 가용 가로폭
      const availableWidth = Math.max(containerWidth - 16, 280)

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        if (isCancelled) break
        const canvas = canvasRefs.current[pageNum - 1]
        if (!canvas) continue

        try {
          const page = await pdfDoc.getPage(pageNum)
          if (isCancelled) break

          const unscaledViewport = page.getViewport({ scale: 1 })
          // baseZoom(110%)일 때 컨테이너 가로폭에 딱 맞고, ±5% 조절 시 비례 증감
          const fitWidthScale = availableWidth / unscaledViewport.width
          const displayScale = fitWidthScale * (zoom / baseZoom)

          const displayViewport = page.getViewport({ scale: displayScale })
          const renderViewport = page.getViewport({ scale: displayScale * dpr })

          const ctx = canvas.getContext('2d')
          if (!ctx) continue

          // style.width/height를 먼저 고정한 뒤 물리 픽셀을 할당해 크기 출렁임 방지
          canvas.style.width = `${Math.floor(displayViewport.width)}px`
          canvas.style.height = `${Math.floor(displayViewport.height)}px`
          canvas.width = Math.floor(renderViewport.width)
          canvas.height = Math.floor(renderViewport.height)

          // 캔버스 배경을 순수 흰색으로 선채움
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)

          const task = page.render({
            canvasContext: ctx,
            viewport: renderViewport,
          })
          renderTasks.push(task)
          await task.promise
        } catch (err: any) {
          if (err?.name !== 'RenderingCancelledException') {
            console.warn(`[CleanPdfViewer] ${pageNum}페이지 렌더링 경고:`, err)
          }
        }
      }

      if (!isCancelled) {
        setIsPagesReady(true)
        if (containerRef.current) {
          const el = containerRef.current
          if (!hasScrolledToStartRef.current) {
            scrollToPageTop(startPage)
            hasScrolledToStartRef.current = true
          } else if (prevCenterYRatio !== null && el.scrollHeight > el.clientHeight) {
            el.scrollTop = Math.max(0, prevCenterYRatio * el.scrollHeight - el.clientHeight / 2)
          }

          // 확대·축소 후 항상 페이지 가로 정중앙에 위치하도록 가로 스크롤 자동 중앙 정렬
          requestAnimationFrame(() => {
            if (!containerRef.current) return
            const target = containerRef.current
            target.scrollLeft = Math.max(0, Math.round((target.scrollWidth - target.clientWidth) / 2))
          })
        }
      }
    }

    renderAllPages()

    return () => {
      isCancelled = true
      renderTasks.forEach((t) => {
        try {
          t.cancel()
        } catch {}
      })
    }
  }, [pdfDoc, numPages, containerWidth, zoom, baseZoom])

  // 지정된 페이지(1-indexed)의 정확한 최상단으로 컨테이너 스크롤 이동 헬퍼
  const scrollToPageTop = (pageNum: number) => {
    const el = containerRef.current
    if (!el || numPages === 0) return
    const targetIdx = Math.max(0, Math.min(pageNum - 1, numPages - 1))
    const targetEl = pageRefs.current[targetIdx]
    if (!targetEl) return

    if (targetIdx === 0) {
      el.scrollTop = 0
      return
    }
    const containerRect = el.getBoundingClientRect()
    const targetRect = targetEl.getBoundingClientRect()
    const nextScrollTop = Math.max(0, Math.round(el.scrollTop + (targetRect.top - containerRect.top) - 8))
    el.scrollTop = nextScrollTop
  }

  // 4. 통합 PDF 내 문항 전환 시(questionKey / startPage 변경) 재렌더링 없이 해당 페이지 최상단으로 즉시 이동
  useEffect(() => {
    if (!isPagesReady || numPages === 0) return
    requestAnimationFrame(() => {
      scrollToPageTop(startPage)
      hasScrolledToStartRef.current = true
    })
  }, [startPage, questionKey, isPagesReady, numPages])

  return (
    <div
      ref={containerRef}
      className="clean-pdf-scroll"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflowX: 'auto',
        overflowY: 'scroll',
        scrollbarGutter: 'stable',
        backgroundColor: '#ffffff',
        padding: '8px',
        boxSizing: 'border-box',
      }}
    >
      {isLoading && (
        <div
          style={{
            height: '100%',
            minHeight: '320px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            color: '#64748b',
            backgroundColor: '#ffffff',
          }}
        >
          <Loader2 size={24} className="animate-spin" color="#2563eb" />
          <span style={{ fontSize: '13px', fontWeight: 600 }}>공식 문제지 PDF를 불러오는 중입니다...</span>
        </div>
      )}

      {errorMsg && !isLoading && (
        <div
          style={{
            padding: '28px 20px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px',
            backgroundColor: '#ffffff',
            color: '#475569',
          }}
        >
          <AlertTriangle size={24} color="#d97706" />
          <p style={{ margin: 0, fontSize: '13.5px', fontWeight: 700, color: '#1e293b' }}>{errorMsg}</p>
          <a
            href={`${url}#page=${startPage}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '7px 14px',
              borderRadius: '8px',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              fontSize: '12.5px',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            <ExternalLink size={13} />
            새 창에서 PDF 직접 열기
          </a>
        </div>
      )}

      {!isLoading && !errorMsg && numPages > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: 'max-content',
            minWidth: '100%',
            gap: '14px',
            backgroundColor: '#ffffff',
            opacity: isPagesReady ? 1 : 0,
            transition: 'opacity 0.12s ease',
          }}
        >
          {Array.from({ length: numPages }, (_, idx) => (
            <div
              key={idx}
              ref={(el) => {
                pageRefs.current[idx] = el
              }}
              style={{
                backgroundColor: '#ffffff',
                borderBottom: idx < numPages - 1 ? '1px solid #f1f5f9' : 'none',
                paddingBottom: idx < numPages - 1 ? '10px' : '0',
              }}
            >
              <canvas
                ref={(el) => {
                  canvasRefs.current[idx] = el
                }}
                style={{
                  display: 'block',
                  backgroundColor: '#ffffff',
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
