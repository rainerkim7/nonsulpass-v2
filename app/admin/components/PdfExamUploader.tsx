'use client'

/**
 * @file app/admin/components/PdfExamUploader.tsx
 * @description 하이브리드 PDF 원문 기반 기출/모의논술 초간편 등록기 컴포넌트
 *              - 문항별 개별 PDF 업로드 및 통합 PDF 1개 + 문항별 시작 페이지 지정 방식 모두 지원
 *              - 대학 공식 채점기준: 텍스트 복사·붙여넣기 및 채점기준/해설 PDF 통첨부 모두 지원
 *              - 대학 고유 채점 체계(점수제 / 등급제 / 등급+점수 병기) + 100점 환산 참고점수 지원
 */

import React, { useState } from 'react'
import {
  FileText,
  UploadCloud,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  Loader2,
  BookOpen,
  ClipboardList,
  ExternalLink,
  Sparkles,
  Cpu,
  Scissors,
  ArrowLeft,
  Pencil,
} from 'lucide-react'
import { getUniversityTracks } from '@/lib/constants/universities'
import type { QuestionScoringSystem } from '@/lib/exam-helper'
import {
  type DraftPdfQuestion,
  type ExtractedScoringData,
  createEmptyDraftQuestion,
} from './pdf-uploader/types'
import PdfQuestionGroupSection from './pdf-uploader/PdfQuestionGroupSection'
import PdfExtraTabsPreview from './pdf-uploader/PdfExtraTabsPreview'

interface PdfExamUploaderProps {
  selectedUniv: string
  univName: string
  /** 기존 시험을 불러와 수정 모드로 열 때 사용하는 시험 ID */
  editExamId?: string | null
  /** 수정 완료 후 되돌아갈 문제보기 페이지 URL */
  returnToExamUrl?: string | null
  /** 수정 모드를 종료하고 신규 등록 모드로 전환하는 콜백 */
  onCancelEdit?: () => void
  onDataSaved: () => void
  showNotice: (type: 'success' | 'error', text: string) => void
}

export default function PdfExamUploader({
  selectedUniv,
  univName,
  editExamId,
  returnToExamUrl,
  onCancelEdit,
  onDataSaved,
  showNotice,
}: PdfExamUploaderProps) {
  const defaultTracks = getUniversityTracks(selectedUniv)
  const isEditMode = Boolean(editExamId)
  const [isLoadingEditExam, setIsLoadingEditExam] = useState<boolean>(false)
  const [slicingQuestionKey, setSlicingQuestionKey] = useState<string | null>(null)

  // 1. 시험 기본 메타데이터 상태
  const [year, setYear] = useState<string>('2026학년도')
  const [examType, setExamType] = useState<'기출문제' | '모의논술' | '예상문제'>('기출문제')
  const [targetFaculty, setTargetFaculty] = useState<string>(defaultTracks[0] || '인문계열 (공통)')
  const [title, setTitle] = useState<string>('')
  const [totalTime, setTotalTime] = useState<number>(100)
  const [summary, setSummary] = useState<string>('')

  // 2. 통합 문제지 PDF(선택) — 모든 문항이 1개 PDF에 들어있고 시작 페이지만 지정할 때 사용
  const [sharedPdfUrl, setSharedPdfUrl] = useState<string>('')
  const [sharedPdfName, setSharedPdfName] = useState<string>('')
  const [isUploadingSharedPdf, setIsUploadingSharedPdf] = useState<boolean>(false)

  // 2-1. 업로드된 PDF 멀티모달 AI 자동 분석 상태
  const [selectedAiModel, setSelectedAiModel] = useState<string>('gemini-3.1-pro-preview')
  const [aiInstruction, setAiInstruction] = useState<string>('')
  const [isAnalyzingPdf, setIsAnalyzingPdf] = useState<boolean>(false)
  // 2-1-B. AI 추출 대상 선택 (1·2단계 문항 / 대학 페이지 '출제 경향(tab2)' & '채점 기준(tab3)')
  // 수정 모드 진입 시 기존 문항 덮어쓰기를 방지하기 위해 includeQuestions는 기본 해제(false)
  const [includeQuestions, setIncludeQuestions] = useState<boolean>(!editExamId)
  const [includeTrends, setIncludeTrends] = useState<boolean>(true)
  const [includeScoring, setIncludeScoring] = useState<boolean>(true)
  const [extractedTrends, setExtractedTrends] = useState<any[]>([])
  const [extractedScoring, setExtractedScoring] = useState<{ scoringRules: any[]; rubrics: any[] } | null>(null)
  const [saveTrendsWithExam, setSaveTrendsWithExam] = useState<boolean>(true)
  const [saveScoringWithExam, setSaveScoringWithExam] = useState<boolean>(true)
  const [isSavingTabsOnly, setIsSavingTabsOnly] = useState<boolean>(false)

  React.useEffect(() => {
    setIncludeQuestions(!editExamId)
  }, [editExamId])

  // 2-2. 「2. 문항 및 제시문」 페이지만 자동 분리 + 반복 배경 학교 로고 워터마크 제거 상태
  const [sliceStartPage, setSliceStartPage] = useState<number>(1)
  const [sliceEndPage, setSliceEndPage] = useState<number>(6)
  const [removeWatermark, setRemoveWatermark] = useState<boolean>(true)
  const [isSlicingPdf, setIsSlicingPdf] = useState<boolean>(false)
  const [isPdfSliced, setIsPdfSliced] = useState<boolean>(false)

  // 3. 문항 리스트 상태
  const [questions, setQuestions] = useState<DraftPdfQuestion[]>([
    createEmptyDraftQuestion(0),
    createEmptyDraftQuestion(1),
  ])
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState<boolean>(false)

  // 대학 변경 시 계열 기본값 동기화 (수정 모드 로드 중에는 기존 시험의 계열 유지)
  React.useEffect(() => {
    if (editExamId) return
    const tracks = getUniversityTracks(selectedUniv)
    setTargetFaculty(tracks[0] || '인문계열 (공통)')
  }, [selectedUniv, editExamId])

  // ✏️ 수정 모드: editExamId가 전달되면 Supabase DB에서 기존 시험 데이터를 자동 로드해 폼에 채움
  React.useEffect(() => {
    if (!editExamId) return
    let cancelled = false
    setIsLoadingEditExam(true)
    fetch(`/api/admin/exams?id=${encodeURIComponent(editExamId)}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((result) => {
        if (cancelled) return
        if (!result.success || !result.exam) {
          showNotice('error', result.error || '수정할 시험 데이터를 불러오지 못했습니다.')
          return
        }
        const exam = result.exam
        setYear(exam.year || '2026학년도')
        if (exam.type === '기출문제' || exam.type === '모의논술' || exam.type === '예상문제') {
          setExamType(exam.type)
        }
        if (exam.target_faculty) setTargetFaculty(exam.target_faculty)
        setTitle(exam.title || '')
        setTotalTime(Number(exam.total_time) || 100)
        setSummary(exam.summary || '')
        const topPdfUrl = exam.pdf_url || ''
        const topPdfName = exam.pdf_name || (topPdfUrl ? '등록된 통합 문제지.pdf' : '')
        setSharedPdfUrl(topPdfUrl)
        setSharedPdfName(topPdfName)
        setIsPdfSliced(false)

        // 저장된 questions(객체 { q1, q2... } 또는 배열)를 DraftPdfQuestion[]로 복원
        const rawQs = exam.questions
        const qList: any[] = Array.isArray(rawQs)
          ? rawQs
          : rawQs && typeof rawQs === 'object'
          ? Object.keys(rawQs)
              .sort((a, b) => {
                const na = Number(a.replace(/[^0-9]/g, '')) || 0
                const nb = Number(b.replace(/[^0-9]/g, '')) || 0
                return na - nb
              })
              .map((k) => rawQs[k])
              .filter(Boolean)
          : []

        if (qList.length > 0) {
          const restored: DraftPdfQuestion[] = qList.map((q, idx) => {
            const qPdfUrl = q.questionPdfUrl || ''
            // 문항 PDF가 상단 통합 PDF와 완전히 동일하면 개별 PDF 필드는 비우고 통합 PDF + 시작 페이지로 관리
            const hasDedicatedPdf = Boolean(qPdfUrl && qPdfUrl !== topPdfUrl)
            const sSys = q.scoringSystem || {}
            const sType: 'score' | 'grade' | 'both' =
              sSys.type === 'score' || sSys.type === 'grade' || sSys.type === 'both' ? sSys.type : 'both'
            const startPage = Math.max(1, Number(q.questionPdfStartPage) || 1)
            return {
              label: q.label || `문제 ${idx + 1}`,
              limit: q.limit || '800±100자',
              note: q.note || '',
              questionPdfUrl: hasDedicatedPdf ? qPdfUrl : '',
              questionPdfName: hasDedicatedPdf ? q.questionPdfName || `문항_${idx + 1}.pdf` : '',
              questionPdfStartPage: startPage,
              sliceFromPage: startPage,
              sliceToPage: startPage,
              scoringType: sType,
              maxScore: Number(sSys.maxScore ?? q.points) || 50,
              gradeScaleText: Array.isArray(sSys.gradeScale)
                ? sSys.gradeScale.join(', ')
                : 'A+, A, B+, B, C, D, F',
              cutlineLabel: sSys.cutlineLabel || '100점 환산 82점 이상',
              rawRubricText: q.rawRubricText || '',
              rubricPdfUrl: q.rubricPdfUrl || '',
              rubricPdfName: q.rubricPdfName || '',
              modelAnswer: q.modelAnswer || '',
            }
          })
          setQuestions(restored)
        }
        showNotice('success', `✏️ "${exam.title}" 시험을 수정 모드로 불러왔습니다. 수정 후 하단 저장 버튼을 눌러주세요.`)
      })
      .catch((err) => {
        if (!cancelled) {
          showNotice('error', err?.message || '시험 데이터 로드 중 오류가 발생했습니다.')
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingEditExam(false)
      })
    return () => {
      cancelled = true
    }
  }, [editExamId])

  // 대문항 그룹 내 모든 소문항 일괄 업데이트 헬퍼
  const updateGroupQuestions = (indices: number[], patch: Partial<DraftPdfQuestion>) => {
    const idxSet = new Set(indices)
    setQuestions((prev) => prev.map((q, idx) => (idxSet.has(idx) ? { ...q, ...patch } : q)))
  }

  // 대문항 그룹 공통 개별 PDF 업로드 (1회 업로드로 하위 소문항 전체에 자동 동기화)
  const handleUploadGroupPdf = async (
    groupKey: string,
    groupTitle: string,
    indices: number[],
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const key = `group-pdf-${groupKey}`
    setUploadingKey(key)
    try {
      const uploaded = await uploadPdfFile(file)
      updateGroupQuestions(indices, {
        questionPdfUrl: uploaded.url,
        questionPdfName: uploaded.name,
        questionPdfStartPage: 1,
      })
      showNotice(
        'success',
        `📄 ${groupTitle} 공통 문제지 PDF("${uploaded.name}")가 하위 ${indices.length}개 소문항에 일괄 적용되었습니다!`
      )
    } catch (err: any) {
      showNotice('error', err.message || 'PDF 업로드 실패')
    } finally {
      setUploadingKey(null)
    }
  }

  // 대문항 그룹에 하위 소문항 추가 (예: 문제 1-1, 1-2 아래에 문제 1-3 자동 추가 + 공통 PDF 상속)
  const handleAddSubQuestion = (majorNum: number, groupIndices: number[]) => {
    const lastIdx = groupIndices[groupIndices.length - 1]
    const leader = questions[groupIndices[0]]
    const nextMinor = groupIndices.length + 1
    const newSub: DraftPdfQuestion = {
      ...createEmptyDraftQuestion(questions.length),
      label: `문제 ${majorNum}-${nextMinor}`,
      questionPdfUrl: leader?.questionPdfUrl || '',
      questionPdfName: leader?.questionPdfName || '',
      questionPdfStartPage: leader?.questionPdfStartPage || 1,
      sliceFromPage: leader?.sliceFromPage ?? leader?.questionPdfStartPage ?? 1,
      sliceToPage: leader?.sliceToPage ?? leader?.questionPdfStartPage ?? 1,
      scoringType: leader?.scoringType || 'both',
      gradeScaleText: leader?.gradeScaleText || 'A+, A, B+, B, C, D, F',
    }
    setQuestions((prev) => [
      ...prev.slice(0, lastIdx + 1),
      newSub,
      ...prev.slice(lastIdx + 1),
    ])
  }

  // ✂️ 특정 문항(또는 대문항 그룹 전체)만 상단 통합 PDF에서 원하는 페이지 범위(시작p~끝p)로 개별 분할
  const handleSliceTargetPdf = async (
    targetKey: string,
    targetTitle: string,
    indices: number[]
  ) => {
    if (!sharedPdfUrl) {
      showNotice('error', '먼저 1단계에 원본/통합 PDF를 업로드해 주세요.')
      return
    }
    const leader = questions[indices[0]]
    const fromP = Math.max(1, Number(leader?.sliceFromPage) || Number(leader?.questionPdfStartPage) || 1)
    const toP = Math.max(fromP, Number(leader?.sliceToPage) || fromP)

    setSlicingQuestionKey(targetKey)
    try {
      const res = await fetch('/api/admin/slice-pdf-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdfUrl: sharedPdfUrl,
          startPage: fromP,
          endPage: toP,
          removeWatermark,
          univId: selectedUniv,
          fileLabel: `${selectedUniv}_${year}_${targetKey}`,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success || !data.url) {
        throw new Error(data.error || '문항별 PDF 페이지 분리에 실패했습니다.')
      }
      updateGroupQuestions(indices, {
        questionPdfUrl: data.url,
        questionPdfName: `[${targetTitle} p.${data.startPage}~${data.endPage}] ${sharedPdfName || '문제지.pdf'}`,
        questionPdfStartPage: 1,
        sliceFromPage: data.startPage,
        sliceToPage: data.endPage,
      })
      showNotice(
        'success',
        `✂️ ${targetTitle}의 ${data.startPage}p ~ ${data.endPage}p(총 ${data.pageCount}페이지)를 분리하여 ${
          indices.length > 1 ? `하위 ${indices.length}개 소문항에 일괄 적용` : '적용'
        }했습니다!`
      )
    } catch (err: any) {
      showNotice('error', err.message || '문항별 PDF 페이지 분리 중 오류가 발생했습니다.')
    } finally {
      setSlicingQuestionKey(null)
    }
  }

  // 공용 PDF 업로드 헬퍼 (Supabase Storage exam-assets 버킷 저장)
  const uploadPdfFile = async (file: File): Promise<{ url: string; name: string }> => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('univId', selectedUniv || 'common')

    const res = await fetch('/api/admin/upload-exam-pdf', {
      method: 'POST',
      body: formData,
    })
    const result = await res.json()
    if (!res.ok || !result.success || !result.url) {
      throw new Error(result.error || 'PDF 업로드에 실패했습니다.')
    }
    return { url: result.url, name: file.name }
  }

  // 통합 문제지 PDF 업로드
  const handleUploadSharedPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setIsUploadingSharedPdf(true)
    try {
      const uploaded = await uploadPdfFile(file)
      setSharedPdfUrl(uploaded.url)
      setSharedPdfName(uploaded.name)
      setIsPdfSliced(false)
      showNotice('success', `통합 문제지 PDF("${uploaded.name}")가 업로드되었습니다. 아래에서 AI 자동 분석 및 문제 페이지만 분리할 수 있습니다.`)
    } catch (err: any) {
      showNotice('error', err.message || '통합 PDF 업로드 실패')
    } finally {
      setIsUploadingSharedPdf(false)
    }
  }

  // ✨ 업로드된 통합 PDF를 AI로 자동 분석하여 선택한 항목(1·2단계 문항 / 출제 경향 / 채점 기준)만 자동 채우기
  const handleAnalyzeSharedPdf = async () => {
    if (!sharedPdfUrl) {
      showNotice('error', '먼저 통합 문제지/보고서 PDF를 업로드해 주세요.')
      return
    }
    if (!includeQuestions && !includeTrends && !includeScoring) {
      showNotice('error', '최소 1개 이상의 추출 대상(문항 / 출제 경향 / 채점 기준)을 체크해 주세요.')
      return
    }

    setIsAnalyzingPdf(true)
    try {
      const res = await fetch('/api/admin/analyze-pdf-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdfUrl: sharedPdfUrl,
          univId: selectedUniv,
          univName,
          targetFaculty,
          customInstruction: aiInstruction.trim(),
          model: selectedAiModel,
          includeQuestions,
          includeTrends,
          includeScoring,
        }),
      })

      const result = await res.json()
      if (!res.ok || !result.success || !result.data) {
        throw new Error(result.error || 'PDF AI 자동 분석에 실패했습니다.')
      }

      const parsed = result.data

      // includeQuestions가 체크된 경우에만 1단계 메타정보 및 2단계 문항 목록을 갱신 (미체크 시 기존 문항 100% 보존)
      if (includeQuestions) {
        if (parsed.year) setYear(String(parsed.year))
        if (parsed.type === '기출문제' || parsed.type === '모의논술' || parsed.type === '예상문제') {
          setExamType(parsed.type)
        }
        if (parsed.title) setTitle(String(parsed.title))
        if (parsed.totalTime && Number(parsed.totalTime) > 0) setTotalTime(Number(parsed.totalTime))
        if (parsed.summary) setSummary(String(parsed.summary))
        if (parsed.problemSectionStartPage && Number(parsed.problemSectionStartPage) > 0) {
          setSliceStartPage(Number(parsed.problemSectionStartPage))
        }
        if (parsed.problemSectionEndPage && Number(parsed.problemSectionEndPage) > 0) {
          setSliceEndPage(Number(parsed.problemSectionEndPage))
        }

        if (Array.isArray(parsed.questions) && parsed.questions.length > 0) {
          const mapped: DraftPdfQuestion[] = parsed.questions.map((q: any, idx: number) => {
            const sType: 'score' | 'grade' | 'both' =
              q.scoringType === 'grade' || q.scoringType === 'score' || q.scoringType === 'both'
                ? q.scoringType
                : 'both'
            const gScale = Array.isArray(q.gradeScale)
              ? q.gradeScale.join(', ')
              : typeof q.gradeScale === 'string'
              ? q.gradeScale
              : 'A+, A0, A-, B+, B0, B-, C, D, F'

            return {
              label: q.label || `문제 ${idx + 1}`,
              limit: q.limit || '800±100자',
              note: '',
              questionPdfUrl: '',
              questionPdfName: '',
              questionPdfStartPage: Math.max(1, Number(q.questionPdfStartPage) || idx + 1),
              scoringType: sType,
              maxScore: Number(q.maxScore) || 100,
              gradeScaleText: gScale,
              cutlineLabel: '100점 환산 82점 이상',
              rawRubricText: q.rawRubricText || '',
              rubricPdfUrl: '',
              rubricPdfName: '',
              modelAnswer: q.modelAnswer || '',
            }
          })
          setQuestions(mapped)
        }
      }

      // 대학 상세 페이지 '출제 경향(tab2)' 및 '채점 기준(tab3)' 추출 결과 반영
      const summaryParts: string[] = []
      if (includeQuestions) {
        summaryParts.push(`문항 ${parsed.questions?.length || 0}개`)
      }
      if (includeTrends && Array.isArray(parsed.tab2_trends) && parsed.tab2_trends.length > 0) {
        setExtractedTrends(parsed.tab2_trends)
        setSaveTrendsWithExam(true)
        summaryParts.push(`출제 경향 ${parsed.tab2_trends.length}건`)
      }
      if (
        includeScoring &&
        parsed.tab3_scoring &&
        ((Array.isArray(parsed.tab3_scoring.scoringRules) && parsed.tab3_scoring.scoringRules.length > 0) ||
          (Array.isArray(parsed.tab3_scoring.rubrics) && parsed.tab3_scoring.rubrics.length > 0))
      ) {
        setExtractedScoring({
          scoringRules: Array.isArray(parsed.tab3_scoring.scoringRules) ? parsed.tab3_scoring.scoringRules : [],
          rubrics: Array.isArray(parsed.tab3_scoring.rubrics) ? parsed.tab3_scoring.rubrics : [],
        })
        setSaveScoringWithExam(true)
        summaryParts.push(
          `채점 기준(${parsed.tab3_scoring.scoringRules?.length || 0}규칙/${parsed.tab3_scoring.rubrics?.length || 0}루브릭)`
        )
      }

      const usedModelLabel = result.modelUsed ? ` (사용 모델: ${result.modelUsed})` : ''
      showNotice(
        'success',
        `✨ AI 분석 완료: [${summaryParts.join(' · ')}]${
          !includeQuestions ? ' (기존 2단계 문항은 변경하지 않고 보존됨)' : ''
        } — 검토 후 저장해 주세요.${usedModelLabel}`
      )
    } catch (err: any) {
      showNotice('error', err.message || 'PDF AI 자동 분석 중 오류가 발생했습니다.')
    } finally {
      setIsAnalyzingPdf(false)
    }
  }

  // ✂️ 문항카드 PDF에서 「2. 문항 및 제시문」 페이지 범위만 물리적으로 잘라내고 반복 학교 로고 워터마크 제거
  const handleSliceProblemPages = async () => {
    if (!sharedPdfUrl) {
      showNotice('error', '먼저 문항카드/통합 PDF를 업로드해 주세요.')
      return
    }
    if (sliceStartPage < 1 || sliceEndPage < sliceStartPage) {
      showNotice('error', '시작 페이지와 끝 페이지 범위를 올바르게 입력해 주세요.')
      return
    }

    setIsSlicingPdf(true)
    try {
      const res = await fetch('/api/admin/slice-pdf-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdfUrl: sharedPdfUrl,
          startPage: sliceStartPage,
          endPage: sliceEndPage,
          removeWatermark,
          univId: selectedUniv,
          fileLabel: `${selectedUniv}_${year}`,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success || !data.url) {
        throw new Error(data.error || 'PDF 문제지 페이지 분리에 실패했습니다.')
      }

      // 잘라낸 순수 문제지 PDF로 자동 교체하고, 각 문항 시작 페이지도 새 PDF 기준(1부터)으로 자동 재계산
      setSharedPdfUrl(data.url)
      setSharedPdfName(`[문제지만 분리 p.${data.startPage}~${data.endPage}] ${sharedPdfName}`)
      setIsPdfSliced(true)
      setQuestions((prev) =>
        prev.map((q) => {
          const adjusted = Math.max(1, (Number(q.questionPdfStartPage) || data.startPage) - data.startPage + 1)
          return {
            ...q,
            questionPdfStartPage: Math.min(adjusted, data.pageCount || 1),
          }
        })
      )

      const wmText =
        data.removedWatermarksCount > 0
          ? ` (반복 배경 학교 로고 워터마크 ${data.removedWatermarksCount}건 자동 제거 완료!)`
          : removeWatermark
          ? ' (반복 워터마크 없음 또는 이미 깨끗함)'
          : ''
      showNotice(
        'success',
        `✂️ ${data.startPage}p ~ ${data.endPage}p(총 ${data.pageCount}페이지)만 순수 문제지 PDF로 분리·교체되었습니다!${wmText}`
      )
    } catch (err: any) {
      showNotice('error', err.message || 'PDF 페이지 분리 중 오류가 발생했습니다.')
    } finally {
      setIsSlicingPdf(false)
    }
  }

  // 문항별 개별 문제지 PDF 또는 채점기준 PDF 업로드
  const handleUploadQuestionPdf = async (
    qIdx: number,
    kind: 'question' | 'rubric',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const key = `${kind}-${qIdx}`
    setUploadingKey(key)
    try {
      const uploaded = await uploadPdfFile(file)
      setQuestions((prev) =>
        prev.map((q, idx) => {
          if (idx !== qIdx) return q
          if (kind === 'question') {
            return { ...q, questionPdfUrl: uploaded.url, questionPdfName: uploaded.name }
          }
          return { ...q, rubricPdfUrl: uploaded.url, rubricPdfName: uploaded.name }
        })
      )
      showNotice(
        'success',
        `${questions[qIdx]?.label || `문제 ${qIdx + 1}`} ${
          kind === 'question' ? '문제지' : '채점기준·해설'
        } PDF("${uploaded.name}") 업로드 완료!`
      )
    } catch (err: any) {
      showNotice('error', err.message || 'PDF 업로드 실패')
    } finally {
      setUploadingKey(null)
    }
  }

  const updateQuestion = (qIdx: number, patch: Partial<DraftPdfQuestion>) => {
    setQuestions((prev) => prev.map((q, idx) => (idx === qIdx ? { ...q, ...patch } : q)))
  }

  const handleAddQuestion = () => {
    setQuestions((prev) => [...prev, createEmptyDraftQuestion(prev.length)])
  }

  const handleRemoveQuestion = (qIdx: number) => {
    if (questions.length <= 1) {
      showNotice('error', '최소 1개 이상의 문항이 필요합니다.')
      return
    }
    setQuestions((prev) => prev.filter((_, idx) => idx !== qIdx))
  }

  // Supabase DB에 하이브리드 PDF 시험 저장
  const handleSavePdfExam = async () => {
    const finalTitle =
      title.trim() || `${year} ${univName} ${examType} (${targetFaculty})`

    // 최소 1개 문항에 개별 PDF 또는 통합 PDF가 있는지 검증
    const missingPdf = questions.some((q) => !q.questionPdfUrl && !sharedPdfUrl)
    if (missingPdf) {
      showNotice(
        'error',
        '각 문항에 개별 문제지 PDF를 첨부하거나, 상단에 통합 문제지 PDF 1개를 업로드해 주세요.'
      )
      return
    }

    setIsSaving(true)
    try {
      // QuestionsMap 형태({ q1, q2, ... })로 표준화하여 저장
      const questionsPayload: Record<string, any> = {}
      const lengthParts: string[] = []

      questions.forEach((q, idx) => {
        const qKey = `q${idx + 1}`
        const effectivePdfUrl = q.questionPdfUrl || sharedPdfUrl
        const effectivePdfName = q.questionPdfName || sharedPdfName
        const gradeScale = q.gradeScaleText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)

        const scoringSystem: QuestionScoringSystem = {
          type: q.scoringType,
          maxScore: Number(q.maxScore) || 100,
          gradeScale: q.scoringType !== 'score' ? gradeScale : undefined,
          cutlineLabel: q.cutlineLabel.trim() || undefined,
        }

        const weightLabel =
          q.scoringType === 'grade'
            ? `${targetFaculty} ${q.label} (공식 등급제: ${gradeScale.join('/')} · 100점 환산 참고 병기)`
            : q.scoringType === 'both'
            ? `${targetFaculty} ${q.label} (${scoringSystem.maxScore}점 만점 / 등급: ${gradeScale.join('/')})`
            : `${targetFaculty} ${q.label} (${scoringSystem.maxScore}점 만점)`

        lengthParts.push(`${q.label}(${q.limit})`)

        questionsPayload[qKey] = {
          id: qKey,
          label: q.label.trim() || `문제 ${idx + 1}`,
          tag: finalTitle,
          title: `【${q.label.trim() || `문제 ${idx + 1}`}】`,
          note: q.note.trim(),
          limit: q.limit.trim() || '800±100자',
          points: scoringSystem.maxScore,
          placeholder: `좌측 PDF 문제지를 읽고 ${q.label.trim() || `문제 ${idx + 1}`} 답안을 작성하세요.`,
          passages: [],
          tipTitle: `${univName} 공식 채점 기준 안내`,
          tipDesc:
            q.scoringType === 'grade'
              ? `대학 공식 등급제(${gradeScale.join('·')}) 기준으로 정밀 채점되며 100점 환산 참고점수가 함께 제공됩니다.`
              : `대학 공식 원배점(${scoringSystem.maxScore}점 만점) 기준으로 정밀 채점됩니다.`,
          modelAnswer: q.modelAnswer.trim() || '공식 예시답안은 채점기준·해설 PDF 또는 원문을 참고하세요.',
          modalTitle: `${q.label.trim() || `문제 ${idx + 1}`} 공식 예시(모범) 답안`,
          modalPill: `${year} ${q.label.trim() || `문제 ${idx + 1}`}`,
          modalLength: `${q.limit.trim() || '규정 분량'} 충족`,
          modalCallout: `💡 ${univName} 공식 출제 기준 기반 예시답안`,
          pdfUrl: effectivePdfUrl,
          pdfName: effectivePdfName,
          // 하이브리드 PDF 전용 필드
          displayMode: 'pdf',
          questionPdfUrl: effectivePdfUrl,
          questionPdfName: effectivePdfName,
          questionPdfStartPage: Math.max(1, Number(q.questionPdfStartPage) || 1),
          rawRubricText: q.rawRubricText.trim(),
          rubricPdfUrl: q.rubricPdfUrl,
          rubricPdfName: q.rubricPdfName,
          scoringSystem,
          rubric: {
            facultyWeight: weightLabel,
            totalScore: `${scoringSystem.maxScore}점 만점`,
            items: [],
            deductions: [
              `규정 글자 수(${q.limit.trim() || '지정 분량'}) 미달 또는 초과 시 대학 기준에 따라 감점`,
              '제시문 문장을 그대로 옮겨 적거나 발문 요구조건을 누락한 경우 감점',
            ],
          },
        }
      })

      const res = await fetch('/api/admin/exams', {
        method: isEditMode ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isEditMode && editExamId ? { id: editExamId } : {}),
          univ_id: selectedUniv,
          year: year.trim() || '2026학년도',
          title: finalTitle,
          type: examType,
          target_faculty: targetFaculty,
          total_time: Number(totalTime) || 100,
          total_length: lengthParts.join(' / '),
          level: '대학 공식 출제 (PDF 원문)',
          summary:
            summary.trim() ||
            `${univName} ${year} ${targetFaculty} 공식 문제지 PDF 및 대학 고유 채점기준 반영`,
          questions: questionsPayload,
          pdf_url: sharedPdfUrl || questions[0]?.questionPdfUrl || '',
          pdf_name: sharedPdfName || questions[0]?.questionPdfName || '',
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'PDF 시험 저장에 실패했습니다.')
      }

      // 3단계: AI가 생성한 대학 페이지 '출제 경향(tab2)' · '채점 기준(tab3)' 함께 DB 저장
      const shouldSaveTab2 = saveTrendsWithExam && extractedTrends.length > 0
      const shouldSaveTab3 =
        saveScoringWithExam &&
        Boolean(
          extractedScoring &&
            (extractedScoring.scoringRules.length > 0 || extractedScoring.rubrics.length > 0)
        )

      let extraSavedMsg = ''
      if (shouldSaveTab2 || shouldSaveTab3) {
        const tabsRes = await fetch('/api/admin/save-all-tabs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            univId: selectedUniv,
            univName,
            targetFaculty,
            tab2_trends: shouldSaveTab2 ? extractedTrends : [],
            tab3_scoring: shouldSaveTab3 ? extractedScoring : {},
            selectedTabs: {
              tab1: false,
              tab2: shouldSaveTab2,
              tab3: shouldSaveTab3,
            },
          }),
        })
        const tabsData = await tabsRes.json()
        if (!tabsRes.ok || !tabsData.success) {
          throw new Error(tabsData.error || '출제 경향 / 채점 기준 탭 저장에 실패했습니다.')
        }
        const savedParts: string[] = []
        if (shouldSaveTab2) savedParts.push('출제 경향')
        if (shouldSaveTab3) savedParts.push('채점 기준')
        extraSavedMsg = ` (${savedParts.join(' · ')} 탭 함께 반영 완료!)`
      }

      if (isEditMode) {
        showNotice(
          'success',
          `✅ "${finalTitle}" 수정 사항이 Supabase DB에 즉시 반영되었습니다!${extraSavedMsg}`
        )
      } else {
        showNotice(
          'success',
          `🎉 "${finalTitle}"이(가) PDF 원문 + 대학 고유 채점기준 모드로 Supabase DB에 저장되었습니다!${extraSavedMsg}`
        )
        setTitle('')
        setSummary('')
        setSharedPdfUrl('')
        setSharedPdfName('')
        setQuestions([createEmptyDraftQuestion(0), createEmptyDraftQuestion(1)])
        setExtractedTrends([])
        setExtractedScoring(null)
      }
      onDataSaved()
    } catch (err: any) {
      showNotice('error', err.message || '저장 중 오류가 발생했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  // 💾 기출시험(exams)은 건드리지 않고, 3단계 '출제 경향' · '채점 기준' 탭만 Supabase DB에 단독 저장
  const handleSaveTabsOnly = async () => {
    const shouldSaveTab2 = saveTrendsWithExam && extractedTrends.length > 0
    const shouldSaveTab3 =
      saveScoringWithExam &&
      Boolean(
        extractedScoring &&
          (extractedScoring.scoringRules.length > 0 || extractedScoring.rubrics.length > 0)
      )

    if (!shouldSaveTab2 && !shouldSaveTab3) {
      showNotice('error', '저장할 출제 경향 또는 채점 기준 항목이 선택되어 있지 않습니다.')
      return
    }

    setIsSavingTabsOnly(true)
    try {
      const tabsRes = await fetch('/api/admin/save-all-tabs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          univId: selectedUniv,
          univName,
          targetFaculty,
          tab2_trends: shouldSaveTab2 ? extractedTrends : [],
          tab3_scoring: shouldSaveTab3 ? extractedScoring : {},
          selectedTabs: {
            tab1: false,
            tab2: shouldSaveTab2,
            tab3: shouldSaveTab3,
          },
        }),
      })
      const tabsData = await tabsRes.json()
      if (!tabsRes.ok || !tabsData.success) {
        throw new Error(tabsData.error || '출제 경향 / 채점 기준 저장에 실패했습니다.')
      }
      const savedParts: string[] = []
      if (shouldSaveTab2) savedParts.push('출제 경향')
      if (shouldSaveTab3) savedParts.push('채점 기준')
      showNotice(
        'success',
        `✅ 기존 문항은 건드리지 않고 ${univName} 대학 페이지의 [${savedParts.join(' · ')}] 탭만 DB에 저장했습니다!`
      )
      onDataSaved()
    } catch (err: any) {
      showNotice('error', err.message || '대학 페이지 탭 저장 중 오류가 발생했습니다.')
    } finally {
      setIsSavingTabsOnly(false)
    }
  }

  return (
    <section className="animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ✏️ 기존 시험 수정 모드 전용 상단 배너 */}
      {isEditMode && (
        <div
          className="admin-card"
          style={{
            background: 'linear-gradient(90deg, #fefce8 0%, #eff6ff 100%)',
            border: '2px solid #f59e0b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Pencil size={18} color="#b45309" />
            <div>
              <strong style={{ fontSize: '14.5px', color: '#92400e', display: 'block' }}>
                {isLoadingEditExam
                  ? '기존 시험 데이터를 불러오는 중...'
                  : `✏️ 수정 모드: ${title || editExamId}`}
              </strong>
              <span style={{ fontSize: '12px', color: '#78350f' }}>
                저장 시 새 시험을 만들지 않고 기존 시험(ID: <code>{editExamId}</code>)을 그대로 업데이트합니다.
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                const targetUrl =
                  returnToExamUrl ||
                  `/?view=exam&univ=${encodeURIComponent(selectedUniv)}&exam=${encodeURIComponent(editExamId || '')}`
                window.location.href = targetUrl
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '7px 13px',
                borderRadius: '8px',
                border: '1px solid #93c5fd',
                background: '#ffffff',
                color: '#1d4ed8',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <ArrowLeft size={14} />
              문제보기 페이지로 돌아가기
            </button>
            {onCancelEdit && (
              <button
                type="button"
                onClick={() => {
                  setTitle('')
                  setSummary('')
                  setSharedPdfUrl('')
                  setSharedPdfName('')
                  setQuestions([createEmptyDraftQuestion(0), createEmptyDraftQuestion(1)])
                  onCancelEdit()
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '7px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <Plus size={13} />
                새 시험 등록으로 전환
              </button>
            )}
          </div>
        </div>
      )}

      {/* 상단 안내 카드 */}
      <div className="admin-card" style={{ background: 'linear-gradient(180deg, #eff6ff 0%, #ffffff 100%)', border: '1px solid #bfdbfe' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <FileText size={20} color="#2563eb" />
          <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
            {univName} PDF 원문 통합 {isEditMode ? '수정' : '등록'} (도표 편집 없음 · 대학 고유 채점기준 그대로 적용)
          </h3>
        </div>
        <p style={{ margin: 0, fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>
          대학 배포 <strong>문제지 PDF를 그대로 업로드</strong>하면 도표·표·수식이 깨지지 않고 실제 시험지 그대로 학생에게 제공됩니다.
          AI 채점 시에도 해당 PDF와 <strong>대학 공식 채점기준 원문(텍스트 또는 해설 PDF)</strong>을 그대로 읽어 대학 고유의 원배점·등급표 + 100점 환산 참고점수로 채점합니다.
        </p>
      </div>

      {/* 1단계: 시험 기본 정보 & 통합 문제지 PDF(선택) */}
      <div className="admin-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <BookOpen size={16} color="#2563eb" />
          1단계. 시험 기본 정보 및 통합 문제지 PDF (선택)
        </h4>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>학년도</label>
            <input className="admin-input" value={year} onChange={(e) => setYear(e.target.value)} placeholder="예: 2026학년도" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>시험 유형</label>
            <select
              className="admin-input"
              value={examType}
              onChange={(e) => setExamType(e.target.value as '기출문제' | '모의논술' | '예상문제')}
            >
              <option value="기출문제">기출문제</option>
              <option value="모의논술">모의논술</option>
              <option value="예상문제">예상문제</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>모집 계열(트랙)</label>
            <select
              className="admin-input"
              value={targetFaculty}
              onChange={(e) => setTargetFaculty(e.target.value)}
            >
              {defaultTracks.map((tr) => (
                <option key={tr} value={tr}>{tr}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>시험 시간 (분)</label>
            <input
              type="number"
              className="admin-input"
              value={totalTime}
              onChange={(e) => setTotalTime(Number(e.target.value) || 100)}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
              공식 시험명 (비워두면 자동 생성)
            </label>
            <input
              className="admin-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`예: ${year} ${univName} 수시 논술고사 (${targetFaculty})`}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
              핵심 주제 요약 (목록 1줄 표시용)
            </label>
            <input
              className="admin-input"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="예: 디지털 리터러시, 국제법의 한계, 인간 연대"
            />
          </div>
        </div>

        {/* 통합 문제지 PDF 업로드 박스 (방식 B: PDF 1개 + 문항별 시작 페이지 지정) */}
        <div
          style={{
            padding: '12px 14px',
            borderRadius: '10px',
            background: '#f8fafc',
            border: '1px dashed #93c5fd',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div>
            <strong style={{ fontSize: '13px', color: '#1e3a8a', display: 'block' }}>
              📄 통합 문제지 PDF 1개 업로드 (선택 — 문항별 시작 페이지 방식 사용 시)
            </strong>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              {sharedPdfUrl
                ? `업로드됨: ${sharedPdfName} (아래 각 문항에서 시작 페이지 번호만 입력하면 자동 이동됩니다)`
                : '문항별로 PDF를 따로 자르지 않고 1개 통합 PDF로 올리실 경우 이곳에 첨부하세요.'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {sharedPdfUrl && (
              <a
                href={sharedPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '12px', color: '#2563eb', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <ExternalLink size={13} /> 미리보기
              </a>
            )}
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '7px 12px',
                borderRadius: '8px',
                background: '#2563eb',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 700,
                cursor: isUploadingSharedPdf ? 'wait' : 'pointer',
              }}
            >
              <input
                type="file"
                accept=".pdf,application/pdf"
                style={{ display: 'none' }}
                disabled={isUploadingSharedPdf}
                onChange={handleUploadSharedPdf}
              />
              {isUploadingSharedPdf ? <Loader2 size={13} className="animate-spin" /> : <UploadCloud size={13} />}
              {sharedPdfUrl ? '통합 PDF 교체' : '통합 PDF 선택'}
            </label>
          </div>
        </div>

        {/* ✨ 업로드된 통합 PDF AI 자동 분석 & 2단계 자동 채우기 패널 */}
        {sharedPdfUrl && (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              background: 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%)',
              border: '1px solid #86efac',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={15} color="#16a34a" />
                <strong style={{ fontSize: '13px', color: '#14532d' }}>
                  AI 자동 분석으로 2단계 문항·채점기준·예시답안 자동 채우기
                </strong>
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#166534', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                  <Cpu size={12} /> 분석 모델:
                </span>
                <select
                  value={selectedAiModel}
                  onChange={(e) => setSelectedAiModel(e.target.value)}
                  disabled={isAnalyzingPdf}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid #86efac',
                    background: '#ffffff',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    color: '#0f172a',
                  }}
                >
                  <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (정밀 권장)</option>
                  <option value="gemini-4-hydrogen">Gemini 4 Hydrogen (고속·고정밀)</option>
                  <option value="gemini-3.8-flash">Gemini 3.8 Flash (가성비)</option>
                  <option value="gemini-4-argon">Gemini 4 Argon</option>
                </select>
              </div>
            </div>

            <textarea
              rows={2}
              className="admin-input"
              value={aiInstruction}
              onChange={(e) => setAiInstruction(e.target.value)}
              disabled={isAnalyzingPdf}
              placeholder='(선택) AI 추가 지시사항 — 예: "문항카드 1(인문 T1)만 추출해 줘" / "자연계열 문제는 제외해 줘"'
              style={{ fontSize: '12.5px', background: '#ffffff', resize: 'vertical' }}
            />

            {/* AI 추출 대상 체크박스 (문항은 이미 등록된 경우 해제하여 기존 2단계 문항을 100% 보존 가능) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', padding: '7px 10px', borderRadius: '7px', background: '#ffffff', border: '1px solid #dcfce7' }}>
              <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#166534' }}>AI 추출 대상:</span>
              <label
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 700, color: includeQuestions ? '#1e3a8a' : '#64748b', cursor: 'pointer' }}
                title="체크 해제 시 기존 1·2단계 문항/PDF 설정을 덮어쓰지 않고 그대로 보존합니다"
              >
                <input
                  type="checkbox"
                  checked={includeQuestions}
                  onChange={(e) => setIncludeQuestions(e.target.checked)}
                  disabled={isAnalyzingPdf}
                />
                1·2단계 문항·채점기준·예시답안
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 700, color: '#334155', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={includeTrends}
                  onChange={(e) => setIncludeTrends(e.target.checked)}
                  disabled={isAnalyzingPdf}
                />
                출제 경향 및 유형 분석
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 700, color: '#334155', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={includeScoring}
                  onChange={(e) => setIncludeScoring(e.target.checked)}
                  disabled={isAnalyzingPdf}
                />
                채점 기준 및 배점 체계
              </label>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>빠른 지시:</span>
                {[
                  '자연계열 문제는 제외하고 선택한 계열 문항만 추출해 줘.',
                  '문항카드 1(첫 번째 회차) 문항 세트만 추출해 줘.',
                  '문항카드 2(두 번째 회차) 문항 세트만 추출해 줘.',
                ].map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    disabled={isAnalyzingPdf}
                    onClick={() => setAiInstruction((prev) => (prev.trim() ? `${prev.trim()}\n${preset}` : preset))}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#334155',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    + {preset.length > 24 ? `${preset.slice(0, 24)}...` : preset}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleAnalyzeSharedPdf}
                disabled={isAnalyzingPdf}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                  color: '#ffffff',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  cursor: isAnalyzingPdf ? 'wait' : 'pointer',
                  boxShadow: '0 2px 8px rgba(22, 163, 74, 0.25)',
                  opacity: isAnalyzingPdf ? 0.75 : 1,
                }}
              >
                {isAnalyzingPdf ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {isAnalyzingPdf
                  ? 'AI가 선택한 항목을 분석하는 중...'
                  : includeQuestions
                  ? '✨ 선택한 항목 AI 자동 분석 & 채우기'
                  : '✨ 출제 경향 · 채점 기준만 AI 추출'}
              </button>
            </div>

            <span style={{ fontSize: '11.5px', color: '#475569' }}>
              💡 1) AI 자동 분석으로 2단계와 문제 페이지 범위를 채운 뒤 → 2) 아래 <strong>「문제지 페이지만 자동 분리」</strong>를 누르면 해설·답안 페이지와 학교 로고 배경이 제거된 순수 문제지 PDF로 자동 교체됩니다.
            </span>

            {/* ✂️ 「2. 문항 및 제시문」 페이지 범위만 물리 분리 + 반복 배경 로고(워터마크) 자동 제거 바 */}
            <div
              style={{
                marginTop: '4px',
                padding: '10px 12px',
                borderRadius: '8px',
                background: isPdfSliced ? '#eff6ff' : '#ffffff',
                border: `1px solid ${isPdfSliced ? '#93c5fd' : '#bbf7d0'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Scissors size={13} color="#2563eb" />
                  문제지 페이지만 분리:
                </span>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#334155' }}>
                  <input
                    type="number"
                    min={1}
                    value={sliceStartPage}
                    onChange={(e) => setSliceStartPage(Math.max(1, Number(e.target.value) || 1))}
                    disabled={isSlicingPdf}
                    style={{ width: '54px', padding: '4px 6px', borderRadius: '6px', border: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 700 }}
                  />
                  <span>p ~</span>
                  <input
                    type="number"
                    min={1}
                    value={sliceEndPage}
                    onChange={(e) => setSliceEndPage(Math.max(1, Number(e.target.value) || 1))}
                    disabled={isSlicingPdf}
                    style={{ width: '54px', padding: '4px 6px', borderRadius: '6px', border: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 700 }}
                  />
                  <span>p</span>
                </div>

                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 700, color: '#334155', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={removeWatermark}
                    onChange={(e) => setRemoveWatermark(e.target.checked)}
                    disabled={isSlicingPdf}
                  />
                  배경 학교 로고(워터마크) 자동 제거
                </label>
              </div>

              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleSliceProblemPages}
                  disabled={isSlicingPdf || isUploadingSharedPdf}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '7px 13px',
                    borderRadius: '7px',
                    border: 'none',
                    background: isPdfSliced ? '#1e40af' : '#2563eb',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: isSlicingPdf ? 'wait' : 'pointer',
                    opacity: isSlicingPdf ? 0.7 : 1,
                  }}
                >
                  {isSlicingPdf ? <Loader2 size={13} className="animate-spin" /> : <Scissors size={13} />}
                  {isSlicingPdf ? '문제지 분리 및 로고 제거 중...' : isPdfSliced ? '✓ 분리 완료 (다시 분리)' : '✂️ 문제지 페이지만 자동 분리 & 교체'}
                </button>

                {/* 잘못 분할된 PDF를 올바르게 편집된 PDF 파일로 즉시 교체 업로드하는 버튼 */}
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '7px 12px',
                    borderRadius: '7px',
                    border: '1px solid #93c5fd',
                    background: '#ffffff',
                    color: '#1d4ed8',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: isUploadingSharedPdf ? 'wait' : 'pointer',
                    opacity: isUploadingSharedPdf ? 0.7 : 1,
                  }}
                  title="잘못 분할된 문제지 대신 올바르게 편집된 PDF 파일을 새로 업로드하여 교체합니다"
                >
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    style={{ display: 'none' }}
                    disabled={isUploadingSharedPdf || isSlicingPdf}
                    onChange={handleUploadSharedPdf}
                  />
                  {isUploadingSharedPdf ? <Loader2 size={13} className="animate-spin" /> : <UploadCloud size={13} />}
                  {isUploadingSharedPdf ? '업로드 중...' : '새로 등록'}
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2단계: 대문항 공통 PDF · 소문항별 대학 고유 채점기준 구성 */}
      <PdfQuestionGroupSection
        questions={questions}
        sharedPdfUrl={sharedPdfUrl}
        uploadingKey={uploadingKey}
        slicingQuestionKey={slicingQuestionKey}
        onAddQuestion={handleAddQuestion}
        onRemoveQuestion={handleRemoveQuestion}
        onUpdateQuestion={updateQuestion}
        onUpdateGroupQuestions={updateGroupQuestions}
        onAddSubQuestion={handleAddSubQuestion}
        onUploadQuestionPdf={handleUploadQuestionPdf}
        onUploadGroupPdf={handleUploadGroupPdf}
        onSliceTargetPdf={handleSliceTargetPdf}
      />

      {/* 3단계 (선택): AI가 생성한 대학 페이지 출제 경향 · 채점 기준 미리보기 및 간편 편집 */}
      <PdfExtraTabsPreview
        extractedTrends={extractedTrends}
        setExtractedTrends={setExtractedTrends}
        extractedScoring={extractedScoring}
        setExtractedScoring={setExtractedScoring}
        saveTrendsWithExam={saveTrendsWithExam}
        setSaveTrendsWithExam={setSaveTrendsWithExam}
        saveScoringWithExam={saveScoringWithExam}
        setSaveScoringWithExam={setSaveScoringWithExam}
        isSaving={isSaving}
        isSavingTabsOnly={isSavingTabsOnly}
        onSaveTabsOnly={handleSaveTabsOnly}
      />

      {/* 하단 저장 버튼 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
        {isEditMode && (
          <button
            type="button"
            onClick={() => {
              const targetUrl =
                returnToExamUrl ||
                `/?view=exam&univ=${encodeURIComponent(selectedUniv)}&exam=${encodeURIComponent(editExamId || '')}`
              window.location.href = targetUrl
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '12px 20px',
              borderRadius: '10px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontSize: '13.5px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <ArrowLeft size={15} />
            문제보기 페이지로 돌아가기
          </button>
        )}
        <button
          type="button"
          onClick={handleSavePdfExam}
          disabled={isSaving || isLoadingEditExam}
          className="admin-btn-save"
          style={{ padding: '12px 26px', fontSize: '14px' }}
        >
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {isSaving
            ? 'Supabase DB에 저장 중...'
            : isEditMode
            ? '💾 수정사항 DB에 덮어쓰기 저장'
            : '💾 PDF 원문 기출시험 DB에 바로 저장'}
        </button>
      </div>
    </section>
  )
}
