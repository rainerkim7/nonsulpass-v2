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
} from 'lucide-react'
import { getUniversityTracks } from '@/lib/constants/universities'
import type { QuestionScoringSystem } from '@/lib/exam-helper'

interface PdfExamUploaderProps {
  selectedUniv: string
  univName: string
  onDataSaved: () => void
  showNotice: (type: 'success' | 'error', text: string) => void
}

interface DraftPdfQuestion {
  label: string
  limit: string
  note: string
  // 문항별 개별 PDF 또는 통합 PDF 시작 페이지
  questionPdfUrl: string
  questionPdfName: string
  questionPdfStartPage: number
  // 대학 고유 채점 체계
  scoringType: 'score' | 'grade' | 'both'
  maxScore: number
  gradeScaleText: string
  cutlineLabel: string
  // 대학 공식 채점기준 (텍스트 & PDF 모두 지원)
  rawRubricText: string
  rubricPdfUrl: string
  rubricPdfName: string
  // 공식 예시답안 (선택)
  modelAnswer: string
}

// 자주 쓰는 대학별 등급 체계 프리셋
const GRADE_SCALE_PRESETS = [
  { label: 'A+~F (외대 등)', value: 'A+, A, B+, B, C+, C, D, F' },
  { label: 'S/A/B/C/D (동국대 등)', value: 'S, A, B, C, D' },
  { label: '상/중상/중/중하/하', value: '상, 중상, 중, 중하, 하' },
  { label: 'A/B/C/D/E', value: 'A, B, C, D, E' },
]

const createEmptyDraftQuestion = (index: number): DraftPdfQuestion => ({
  label: `문제 ${index + 1}`,
  limit: '800±100자',
  note: '',
  questionPdfUrl: '',
  questionPdfName: '',
  questionPdfStartPage: index + 1,
  scoringType: 'both',
  maxScore: 50,
  gradeScaleText: 'A+, A, B+, B, C, D, F',
  cutlineLabel: '100점 환산 82점 이상',
  rawRubricText: '',
  rubricPdfUrl: '',
  rubricPdfName: '',
  modelAnswer: '',
})

export default function PdfExamUploader({
  selectedUniv,
  univName,
  onDataSaved,
  showNotice,
}: PdfExamUploaderProps) {
  const defaultTracks = getUniversityTracks(selectedUniv)

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

  // 3. 문항 리스트 상태
  const [questions, setQuestions] = useState<DraftPdfQuestion[]>([
    createEmptyDraftQuestion(0),
    createEmptyDraftQuestion(1),
  ])
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState<boolean>(false)

  // 대학 변경 시 계열 기본값 동기화
  React.useEffect(() => {
    const tracks = getUniversityTracks(selectedUniv)
    setTargetFaculty(tracks[0] || '인문계열 (공통)')
  }, [selectedUniv])

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
      showNotice('success', `통합 문제지 PDF("${uploaded.name}")가 업로드되었습니다. 각 문항의 시작 페이지를 지정해 주세요.`)
    } catch (err: any) {
      showNotice('error', err.message || '통합 PDF 업로드 실패')
    } finally {
      setIsUploadingSharedPdf(false)
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
          questionPdfStartPage: q.questionPdfUrl ? 1 : Math.max(1, Number(q.questionPdfStartPage) || 1),
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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

      showNotice(
        'success',
        `🎉 "${finalTitle}"이(가) PDF 원문 + 대학 고유 채점기준 모드로 Supabase DB에 저장되었습니다!`
      )
      setTitle('')
      setSummary('')
      setSharedPdfUrl('')
      setSharedPdfName('')
      setQuestions([createEmptyDraftQuestion(0), createEmptyDraftQuestion(1)])
      onDataSaved()
    } catch (err: any) {
      showNotice('error', err.message || '저장 중 오류가 발생했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 상단 안내 카드 */}
      <div className="admin-card" style={{ background: 'linear-gradient(180deg, #eff6ff 0%, #ffffff 100%)', border: '1px solid #bfdbfe' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <FileText size={20} color="#2563eb" />
          <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
            {univName} PDF 원문 간편 등록 (도표 편집 없음 · 대학 고유 채점기준 그대로 적용)
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
      </div>

      {/* 2단계: 문항별 PDF · 대학 고유 채점기준 구성 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ClipboardList size={16} color="#2563eb" />
            2단계. 문항별 문제지 PDF 및 대학 고유 채점기준 ({questions.length}문항)
          </h4>
          <button
            type="button"
            onClick={handleAddQuestion}
            className="admin-btn-secondary"
            style={{ fontSize: '12.5px', fontWeight: 700 }}
          >
            <Plus size={14} /> 문항 추가
          </button>
        </div>

        {questions.map((q, qIdx) => (
          <div
            key={qIdx}
            className="admin-card"
            style={{ border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '14px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
              <span style={{ fontSize: '14.5px', fontWeight: 800, color: '#1e3a8a' }}>
                {q.label || `문제 ${qIdx + 1}`} 설정
              </span>
              {questions.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveQuestion(qIdx)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 9px',
                    borderRadius: '6px',
                    border: '1px solid #fecaca',
                    background: '#fef2f2',
                    color: '#dc2626',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <Trash2 size={12} /> 삭제
                </button>
              )}
            </div>

            {/* 문항 기본 규격 + 채점 체계 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>문항 명칭</label>
                <input
                  className="admin-input"
                  value={q.label}
                  onChange={(e) => updateQuestion(qIdx, { label: e.target.value })}
                  placeholder="예: 문제 1, 논제 I"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>규정 글자 수</label>
                <input
                  className="admin-input"
                  value={q.limit}
                  onChange={(e) => updateQuestion(qIdx, { limit: e.target.value })}
                  placeholder="예: 400±40자"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>대학 고유 채점 방식</label>
                <select
                  className="admin-input"
                  value={q.scoringType}
                  onChange={(e) => updateQuestion(qIdx, { scoringType: e.target.value as 'score' | 'grade' | 'both' })}
                >
                  <option value="both">등급 + 원배점 병기 (추천)</option>
                  <option value="grade">등급제 (A+~F 등) + 100점 환산 참고</option>
                  <option value="score">원배점 점수제 (30/40/100점)</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>문항 원만점 (점)</label>
                <input
                  type="number"
                  className="admin-input"
                  value={q.maxScore}
                  onChange={(e) => updateQuestion(qIdx, { maxScore: Number(e.target.value) || 100 })}
                />
              </div>
            </div>

            {/* 등급 체계 입력 (등급제 또는 병기 선택 시 노출) */}
            {q.scoringType !== 'score' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#334155' }}>
                    대학 공식 등급 체계 (쉼표 구분)
                  </label>
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    {GRADE_SCALE_PRESETS.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => updateQuestion(qIdx, { gradeScaleText: p.value })}
                        style={{
                          padding: '2px 8px',
                          borderRadius: '9999px',
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          fontSize: '11px',
                          fontWeight: 600,
                          color: '#334155',
                          cursor: 'pointer',
                        }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  className="admin-input"
                  value={q.gradeScaleText}
                  onChange={(e) => updateQuestion(qIdx, { gradeScaleText: e.target.value })}
                  placeholder="예: A+, A, B+, B, C, D, F"
                />
              </div>
            )}

            {/* 문항별 PDF 첨부 & 시작 페이지 지정 (2가지 방식 모두 지원) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', alignItems: 'center', padding: '10px 12px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
              <div>
                <strong style={{ fontSize: '12.5px', color: '#1e3a8a', display: 'block' }}>
                  📄 {q.label} 개별 문제지 PDF (미첨부 시 상단 통합 PDF 사용)
                </strong>
                <span style={{ fontSize: '11.5px', color: '#475569' }}>
                  {q.questionPdfUrl ? (
                    <span style={{ color: '#15803d', fontWeight: 700 }}>
                      <CheckCircle2 size={12} style={{ display: 'inline', marginRight: '4px' }} />
                      {q.questionPdfName}
                    </span>
                  ) : sharedPdfUrl ? (
                    `통합 PDF 사용 중 → 시작 페이지: ${q.questionPdfStartPage}p`
                  ) : (
                    '개별 문제지 PDF를 업로드하거나 상단에 통합 PDF를 등록해 주세요.'
                  )}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {!q.questionPdfUrl && sharedPdfUrl && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#334155' }}>시작 페이지:</span>
                    <input
                      type="number"
                      min={1}
                      value={q.questionPdfStartPage}
                      onChange={(e) => updateQuestion(qIdx, { questionPdfStartPage: Math.max(1, Number(e.target.value) || 1) })}
                      style={{ width: '56px', padding: '4px 6px', borderRadius: '6px', border: '1px solid #93c5fd', fontSize: '12px', textAlign: 'center', background: '#fff' }}
                    />
                  </div>
                )}
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 11px',
                    borderRadius: '7px',
                    background: '#ffffff',
                    color: '#2563eb',
                    border: '1px solid #93c5fd',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: uploadingKey === `question-${qIdx}` ? 'wait' : 'pointer',
                  }}
                >
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    style={{ display: 'none' }}
                    disabled={uploadingKey === `question-${qIdx}`}
                    onChange={(e) => handleUploadQuestionPdf(qIdx, 'question', e)}
                  />
                  {uploadingKey === `question-${qIdx}` ? <Loader2 size={12} className="animate-spin" /> : <UploadCloud size={12} />}
                  {q.questionPdfUrl ? '개별 PDF 교체' : '개별 PDF 첨부'}
                </label>
              </div>
            </div>

            {/* 대학 공식 채점기준 (텍스트 붙여넣기 + 채점기준 PDF 첨부 모두 지원) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <label style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a' }}>
                  📋 대학 공식 채점 기준 · 출제의도 · 등급표 원문 (텍스트 입력 및/또는 해설 PDF 첨부)
                </label>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    background: q.rubricPdfUrl ? '#f0fdf4' : '#f8fafc',
                    color: q.rubricPdfUrl ? '#15803d' : '#334155',
                    border: `1px solid ${q.rubricPdfUrl ? '#86efac' : '#cbd5e1'}`,
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: uploadingKey === `rubric-${qIdx}` ? 'wait' : 'pointer',
                  }}
                >
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    style={{ display: 'none' }}
                    disabled={uploadingKey === `rubric-${qIdx}`}
                    onChange={(e) => handleUploadQuestionPdf(qIdx, 'rubric', e)}
                  />
                  {uploadingKey === `rubric-${qIdx}` ? <Loader2 size={12} className="animate-spin" /> : <UploadCloud size={12} />}
                  {q.rubricPdfUrl ? `채점기준 PDF 첨부됨 (${q.rubricPdfName})` : '+ 채점기준·해설 PDF 첨부'}
                </label>
              </div>
              <textarea
                rows={4}
                className="admin-input"
                value={q.rawRubricText}
                onChange={(e) => updateQuestion(qIdx, { rawRubricText: e.target.value })}
                placeholder="대학 입학처 보고서의 [출제의도], [채점기준/등급표], [감점 기준] 원문을 가공 없이 그대로 복사·붙여넣기 하세요. (또는 우측 버튼으로 해설 PDF를 통째로 첨부하세요)"
                style={{ fontSize: '12.5px', lineHeight: 1.55, resize: 'vertical' }}
              />
            </div>

            {/* 공식 예시답안 (선택) */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                ✍️ 공식 예시답안 원문 (선택 — 해설 PDF에 포함되어 있으면 비워두셔도 됩니다)
              </label>
              <textarea
                rows={3}
                className="admin-input"
                value={q.modelAnswer}
                onChange={(e) => updateQuestion(qIdx, { modelAnswer: e.target.value })}
                placeholder="예시답안 모달 및 AI 1:1 첨삭(Rewrite) 참고용으로 공식 예시답안을 붙여넣으세요."
                style={{ fontSize: '12.5px', lineHeight: 1.55, resize: 'vertical' }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* 하단 저장 버튼 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={handleSavePdfExam}
          disabled={isSaving}
          className="admin-btn-save"
          style={{ padding: '12px 26px', fontSize: '14px' }}
        >
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {isSaving ? 'Supabase DB에 저장 중...' : '💾 PDF 원문 기출시험 DB에 바로 저장'}
        </button>
      </div>
    </section>
  )
}
