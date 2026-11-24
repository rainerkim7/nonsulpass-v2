'use client'

/**
 * @file components/exam/ExamWorkspace.tsx
 * @description 논술 기출 및 모의고사 문제 응시, 제시문 독해 및 원고지 답안 작성 화면 컴포넌트
 */

import React, { useState, useRef, useEffect } from 'react'
import {
  Clock3,
  FileText,
  Check,
  RotateCcw,
  Lightbulb,
  ClipboardList,
  AlertTriangle,
  ArrowRight,
  Loader2,
  X,
  Sparkles,
  BookOpen,
  CheckCircle2,
  Coins,
  Terminal,
  Camera,
  Pencil
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import Brand from '@/components/common/Brand'
import { useAuth } from '@/components/AuthGate'
import { supabase } from '@/lib/supabase'
import { getQuestionsData, fetchExamQuestionsFromDb, QuestionsMap } from '@/lib/exam-helper'
import { getUniversityId } from '@/lib/constants/universities'
import type { GradingReportData } from '@/types/grading'
import ManuscriptModal from './ManuscriptModal'
import HandwritingOcrModal from './HandwritingOcrModal'
import PromptInspectorModal from './PromptInspectorModal'
import PassPurchaseModal from '@/components/payment/PassPurchaseModal'
import { useUserPass } from '@/lib/use-user-pass'
import { renderFormattedParagraph } from './PassageContentRenderer'
import SubmissionHistorySection, { type SubmissionHistoryItem } from './SubmissionHistorySection'
import { ModelAnswerModal, RubricModal, GradingLoadingOverlay } from './ExamReferenceModals'
import CleanPdfViewer from './CleanPdfViewer'

interface ExamWorkspaceProps {
  selectedUniv?: string
  selectedExamId?: string
  initialQuestion?: string
  onReport: (report?: GradingReportData, questionId?: string) => void
  onBack?: () => void
  onHome?: () => void
}

export default function ExamWorkspace({
  selectedUniv = '홍익대학교',
  selectedExamId = 'hongik-2026-humanities-real',
  initialQuestion = 'q1',
  onReport,
  onBack,
  onHome,
}: ExamWorkspaceProps) {
  // 로그인 사용자 및 관리자 권한 확인
  const { isAdmin, user, openAuthModal } = useAuth()

  // 현재 응시 중인 대학명 (props와 동기화)
  const currentUniv = selectedUniv || (selectedExamId?.startsWith('khu') ? '경희대학교' : selectedExamId?.startsWith('dongguk') ? '동국대학교' : '홍익대학교')

  // 대학 패스 및 잔여 채점 크레딧 상태 관리
  const {
    remainingCredits,
    checkCreditEligibility,
    consumeCredit,
    consumeOcrCredit,
    grantPass,
    isPurchaseModalOpen,
    openPurchaseModal,
    closePurchaseModal,
  } = useUserPass(currentUniv)

  // 문제 탭 전환 상태 (q1, q2, q3 등 동적 지원)
  const [activeQuestion, setActiveQuestion] = useState<string>(initialQuestion || 'q1')

  // 문제별 작성 답안 및 활성 리포트 localStorage 실시간 자동 보존 및 복원 키 헬퍼 (사용자별 ID 격리 적용)
  const currentUserId = user ? user.id : 'guest'
  const getDraftStorageKey = (examId: string, qKey: string) => `nonsul_draft_${currentUserId}_${examId || 'common'}_${qKey}`
  const getActiveSubKey = (examId: string, qKey: string) => `nonsul_active_sub_${currentUserId}_${examId || 'common'}_${qKey}`
  const getActiveReportKey = (examId: string, qKey: string) => `nonsul_active_report_${currentUserId}_${examId || 'common'}_${qKey}`

  // 문제별 작성 답안 상태 (컴포넌트 마운트 시 localStorage에 저장된 임시 답안 자동 복원)
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      const targetExam = selectedExamId || 'common'
      const key = `nonsul_draft_${currentUserId}_${targetExam}_${initialQuestion || 'q1'}`
      const saved = localStorage.getItem(key)
      return saved ? { [initialQuestion || 'q1']: saved } : {}
    } catch {
      return {}
    }
  })
  const [showModelModal, setShowModelModal] = useState(false)
  const [showRubricModal, setShowRubricModal] = useState(false)
  // ▦ 200자 정통 원고지 팝업 모달 상태
  const [showManuscriptModal, setShowManuscriptModal] = useState<boolean>(false)
  // 📷 손글씨/원고지 사진 다중 업로드 및 Gemini AI 텍스트 변환(OCR) 모달 상태
  const [showOcrModal, setShowOcrModal] = useState<boolean>(false)
  // 🔍 관리자 전용 채점 프롬프트 실시간 검사 및 튜닝 모달 상태
  const [showPromptInspector, setShowPromptInspector] = useState<boolean>(false)

  // 📝 수험생 이전 제출 및 첨삭 이력 상태
  const [submissionHistory, setSubmissionHistory] = useState<SubmissionHistoryItem[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false)
  // 현재 선택되어 에디터에 로드된 첨삭 이력 ID (localStorage 하이브리드 연동으로 언마운트 시에도 영구 기억)
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const targetExam = selectedExamId || 'common'
      const key = `nonsul_active_sub_${currentUserId}_${targetExam}_${initialQuestion || 'q1'}`
      return localStorage.getItem(key)
    } catch {
      return null
    }
  })

  // 답안 불러오기 안내 토스트 배너 상태
  const [loadNotice, setLoadNotice] = useState<string | null>(null)

  // ⏱️ 실전 답안 작성 경과 시간 스톱워치 상태 (기본값: 중지 00:00, 시:분 표시)
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0)
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false)

  useEffect(() => {
    if (!isTimerRunning) return
    const timerId = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
    }, 1000)
    return () => window.clearInterval(timerId)
  }, [isTimerRunning])

  const handleToggleTimer = () => {
    setIsTimerRunning((prev) => !prev)
  }

  const handleResetTimer = () => {
    setIsTimerRunning(false)
    setElapsedSeconds(0)
  }

  const elapsedHoursStr = String(Math.floor(elapsedSeconds / 3600)).padStart(2, '0')
  const elapsedMinutesStr = String(Math.floor((elapsedSeconds % 3600) / 60)).padStart(2, '0')

  // 이전 작성 답안 에디터로 불러오기 핸들러 (선택된 이력 ID 갱신, 에디터 로드, 로컬 스토리지에 1:1 영구 저장)
  const handleLoadSubmissionAnswer = (item: SubmissionHistoryItem) => {
    setSelectedSubmissionId(item.id)
    handleAnswerChange(item.student_answer)
    if (typeof window !== 'undefined') {
      try {
        const subKey = getActiveSubKey(selectedExamId, activeQuestion)
        const reportKey = getActiveReportKey(selectedExamId, activeQuestion)
        localStorage.setItem(subKey, item.id)
        if (item.grading_report) {
          const repObj = typeof item.grading_report === 'string'
            ? JSON.parse(item.grading_report)
            : item.grading_report
          const reportJson = JSON.stringify(repObj)
          localStorage.setItem(reportKey, reportJson)
          localStorage.setItem('nonsul_active_grading_report', reportJson)
        }
      } catch (e) {
        console.warn('[ExamWorkspace] active submission 로컬 저장 오류:', e)
      }
    }
    setLoadNotice('선택하신 답안을 작성창에 불러왔습니다. 상단의 [리포트] 버튼을 클릭하면 이 답안의 채점 리포트를 언제든 확인할 수 있습니다.')
    setTimeout(() => {
      setLoadNotice(null)
    }, 4500)
  }

  // 첨삭 이력 카드 클릭 토글 핸들러 (선택 시 답안 로드, 이미 선택된 카드 재클릭 시 선택 해제 및 답안 지우기)
  const handleToggleSubmissionCard = (item: SubmissionHistoryItem) => {
    if (selectedSubmissionId === item.id) {
      // 이미 선택된 카드를 다시 클릭하면: 선택 해제 및 작성창 답안 비우기
      setSelectedSubmissionId(null)
      handleAnswerChange('')
      if (typeof window !== 'undefined') {
        try {
          const subKey = getActiveSubKey(selectedExamId, activeQuestion)
          const reportKey = getActiveReportKey(selectedExamId, activeQuestion)
          localStorage.removeItem(subKey)
          localStorage.removeItem(reportKey)
        } catch (e) {
          console.warn('[ExamWorkspace] active submission 로컬 삭제 오류:', e)
        }
      }
      setLoadNotice('선택을 해제하고 답안 작성창을 초기화했습니다.')
      setTimeout(() => {
        setLoadNotice(null)
      }, 3000)
    } else {
      // 새로운 카드를 클릭하면 답안 로드
      handleLoadSubmissionAnswer(item)
    }
  }

  // 이전 제출 이력 삭제 핸들러
  const handleDeleteSubmission = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('정말로 이 첨삭 기록을 삭제하시겠습니까?')) return
    try {
      const { error } = await supabase.from('student_submissions').delete().eq('id', id)
      if (error) throw error
      setSubmissionHistory(prev => prev.filter(item => item.id !== id))
    } catch (err: any) {
      alert(`삭제 오류: ${err.message}`)
    }
  }

  // Gemini AI 정밀 채점 로딩 및 중단 컨트롤러 상태
  const [isGrading, setIsGrading] = useState(false)
  const [gradingStep, setGradingStep] = useState(1)
  const [gradingNotice, setGradingNotice] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // 하이브리드 PDF 문제지 배율 상태 (기본값 130%, 가로맞춤 기준 110%, 50~250% 5% 단위 조절)
  const PDF_ZOOM_MIN = 50
  const PDF_ZOOM_MAX = 250
  const PDF_ZOOM_STEP = 5
  const PDF_ZOOM_BASE = 110
  const PDF_ZOOM_DEFAULT = 130
  const [pdfZoom, setPdfZoom] = useState<number>(PDF_ZOOM_DEFAULT)

  const handleZoomOutPdf = () => {
    setPdfZoom((prev) => Math.max(PDF_ZOOM_MIN, prev - PDF_ZOOM_STEP))
  }

  const handleZoomInPdf = () => {
    setPdfZoom((prev) => Math.min(PDF_ZOOM_MAX, prev + PDF_ZOOM_STEP))
  }

  // 1. 초기 렌더링: 로컬 프리셋으로 즉시 렌더링 (블랭크 화면 방지)
  const [questionsData, setQuestionsData] = useState<QuestionsMap>(() => getQuestionsData(selectedExamId))

  // 2. 비동기 DB 조회: Supabase DB에 등록된 questions(문항/제시문)가 있으면 실시간 동적 주입
  useEffect(() => {
    let isMounted = true
    if (selectedExamId) {
      fetchExamQuestionsFromDb(selectedExamId).then((dbData) => {
        if (isMounted && dbData) {
          setQuestionsData(dbData)
        }
      })
    }
    return () => {
      isMounted = false
    }
  }, [selectedExamId])

  const currentQ = questionsData[activeQuestion] || questionsData.q1
  const currentAnswer = answers[activeQuestion] || ''

  // 현재 문항의 이전 제출 및 첨삭 이력 조회 핸들러
  const fetchSubmissionHistory = async () => {
    if (!user) {
      setSubmissionHistory([])
      return
    }
    setIsLoadingHistory(true)
    try {
      const currentLabel = questionsData[activeQuestion]?.label || '문항 1'
      const { data, error } = await supabase
        .from('student_submissions')
        .select('*')
        .eq('user_id', user.id)
        .eq('exam_id', selectedExamId)
        .eq('question_label', currentLabel)
        .order('created_at', { ascending: false })

      if (error) {
        console.warn('[ExamWorkspace] 제출 이력 조회 오류:', error.message)
      } else {
        setSubmissionHistory(data || [])
      }
    } catch (err: any) {
      console.warn('[ExamWorkspace] 제출 이력 조회 예외:', err)
    } finally {
      setIsLoadingHistory(false)
    }
  }

  const currentQuestionLabel = questionsData[activeQuestion]?.label || '문항 1'

  // 문항/시험/사용자 변경 시 이력 자동 조회 (불필요한 전체 객체 재조회 방지)
  useEffect(() => {
    fetchSubmissionHistory()
  }, [user, selectedExamId, activeQuestion, currentQuestionLabel])

  // 사용자(user), 문항(activeQuestion), 시험(selectedExamId) 전환 시 localStorage 임시 답안 및 활성 회차 복원
  // (로그아웃하거나 다른 사용자로 로그인 시 이전 사용자의 답안과 이력이 즉시 초기화/분리됨)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const draftKey = getDraftStorageKey(selectedExamId, activeQuestion)
    const savedDraft = localStorage.getItem(draftKey) || ''
    setAnswers(prev => ({ ...prev, [activeQuestion]: savedDraft }))

    const subKey = getActiveSubKey(selectedExamId, activeQuestion)
    const savedSubId = localStorage.getItem(subKey)
    setSelectedSubmissionId(savedSubId || null)
  }, [currentUserId, selectedExamId, activeQuestion])

  // 답안 작성 및 변경 시 React State + localStorage 실시간 자동 저장
  const handleAnswerChange = (val: string) => {
    setAnswers((prev) => ({ ...prev, [activeQuestion]: val }))
    if (typeof window !== 'undefined') {
      try {
        const key = getDraftStorageKey(selectedExamId, activeQuestion)
        if (val && val.trim().length > 0) {
          localStorage.setItem(key, val)
        } else {
          localStorage.removeItem(key)
        }
      } catch (e) {
        console.warn('[ExamWorkspace] 임시 답안 로컬 저장 오류:', e)
      }
    }
  }

  // 상단 헤더의 [리포트] 모드 전환 버튼 클릭 핸들러 (현재 선택된 답안의 채점 리포트 화면으로 1:1 강제 동기화)
  const handleGoToReportMode = () => {
    let targetReport: GradingReportData | null = null
    const draftText = (answers[activeQuestion] || '').trim()

    // 1. 하단 이력에서 특정 카드를 선택하여 보고 있는 경우 (selectedSubmissionId 또는 localStorage activeId)
    let activeId = selectedSubmissionId
    if (!activeId && typeof window !== 'undefined') {
      try {
        activeId = localStorage.getItem(getActiveSubKey(selectedExamId, activeQuestion))
      } catch {}
    }

    if (activeId && submissionHistory && submissionHistory.length > 0) {
      const found = submissionHistory.find((s) => s.id === activeId)
      if (found && found.grading_report) {
        targetReport = typeof found.grading_report === 'string'
          ? JSON.parse(found.grading_report)
          : found.grading_report
      }
    }

    // 특정 카드가 선택되어 리포트가 있으면 1:1 즉시 이동
    if (targetReport) {
      if (typeof window !== 'undefined') {
        try {
          const reportJson = JSON.stringify(targetReport)
          localStorage.setItem(getActiveReportKey(selectedExamId, activeQuestion), reportJson)
          localStorage.setItem('nonsul_active_grading_report', reportJson)
        } catch {}
      }
      onReport(targetReport, activeQuestion as 'q1' | 'q2')
      return
    }

    // 2. 글 내용이 공백이거나 비어있는 경우: 리포트 페이지로 넘어가지 않고 안내 메시지 표시 후 작성창 포커스
    if (!draftText) {
      setLoadNotice('작성된 답안이 없거나 선택된 첨삭 이력이 없습니다. 답안을 작성하시거나 하단 첨삭 이력에서 회차를 먼저 선택해 주세요.')
      setTimeout(() => {
        setLoadNotice(null)
      }, 5000)

      if (typeof window !== 'undefined') {
        const textarea = document.querySelector('textarea')
        if (textarea) {
          textarea.focus()
        }
      }
      return
    }

    // 3. 글 내용이 있는 상태에서 아직 채점되지 않은 새 답안인 경우 (이전 채점 이력 존재 시 확인 창 표시)
    if (submissionHistory && submissionHistory.length > 0) {
      const latestSub = submissionHistory[0]

      const shouldViewLatest = confirm(
        `현재 작성 중인 답안은 아직 채점되지 않았습니다.\n이전에 채점받았던 가장 최근(#${submissionHistory.length}회차) 리포트를 확인하시겠습니까?\n\n(작성 중인 답안은 안전하게 자동 보존됩니다.)`
      )
      if (!shouldViewLatest) return

      const rep = latestSub.grading_report
      targetReport = typeof rep === 'string' ? JSON.parse(rep) : rep

      if (targetReport) {
        if (typeof window !== 'undefined') {
          try {
            const reportJson = JSON.stringify(targetReport)
            localStorage.setItem(getActiveReportKey(selectedExamId, activeQuestion), reportJson)
            localStorage.setItem('nonsul_active_grading_report', reportJson)
          } catch {}
        }
        onReport(targetReport, activeQuestion as 'q1' | 'q2')
        return
      }
    }

    // 4. 이 문항에 대한 채점 이력이 아예 없는 경우: 친절한 토스트 안내 및 작성창 포커스
    setLoadNotice('아직 이 문항에 대해 채점받은 리포트가 없습니다. 답안을 작성하신 후 하단의 [실전 AI 채점 제출]을 먼저 진행해 주세요!')
    setTimeout(() => {
      setLoadNotice(null)
    }, 5000)

    if (typeof window !== 'undefined') {
      const textarea = document.querySelector('textarea')
      if (textarea) {
        textarea.focus()
      }
    }
  }

  // 사용자가 채점 진행 팝업에서 '중단하기'를 클릭했을 때 API 요청을 중단하고 진행창을 닫는 핸들러
  const handleCancelGrading = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsGrading(false)
  }

  // 🔍 관리자 전용 커스텀 프롬프트 기반 즉시 채점 핸들러
  const handleRunCustomGrade = async (customSysPrompt: string, customUserPrompt: string) => {
    const trimmed = currentAnswer.trim()
    if (!trimmed || trimmed.length < 30) {
      alert('답안을 최소 30자 이상 작성하신 후 채점을 진행해 주세요.')
      return
    }

    setIsGrading(true)
    setGradingStep(1)
    setShowPromptInspector(false)

    // 관리자 커스텀 채점에서도 '중단하기' 버튼으로 API 요청을 즉시 취소할 수 있도록 연결
    const controller = new AbortController()
    abortControllerRef.current = controller

    const t1 = setTimeout(() => setGradingStep(2), 2200)
    const t2 = setTimeout(() => setGradingStep(3), 4800)

    try {
      const res = await fetch('/api/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          university: currentUniv,
          examTitle: currentQ.tag || `${currentUniv} 수시 논술`,
          questionLabel: currentQ.label,
          questionTitle: currentQ.title,
          charLimit: currentQ.limit || '800±100자',
          passages: currentQ.passages,
          rubric: currentQ.rubric,
          modelAnswer: currentQ.modelAnswer,
          questionPdfUrl: currentQ.questionPdfUrl || '',
          rawRubricText: currentQ.rawRubricText || '',
          rubricPdfUrl: currentQ.rubricPdfUrl || '',
          scoringSystem: currentQ.scoringSystem || null,
          studentAnswer: currentAnswer,
          studentName: '관리자(시뮬레이션)',
          customSystemPrompt: customSysPrompt,
          customUserPrompt: customUserPrompt,
        }),
      })

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson?.error || '채점 분석 서버 응답 오류가 발생했습니다.')
      }

      const reportData: GradingReportData = await res.json()

      // 로그인된 수험생/관리자의 경우 DB에 답안 및 채점 리포트 영구 저장
      if (user) {
        try {
          const { data: insertData, error: saveErr } = await supabase
            .from('student_submissions')
            .insert({
              user_id: user.id,
              exam_id: selectedExamId,
              exam_title: currentQ.tag || `${currentUniv} 수시 논술`,
              university: currentUniv,
              question_label: currentQ.label || '문항 1',
              student_answer: currentAnswer,
              char_count: currentAnswer.length,
              total_score: reportData.totalScore || 0,
              status_verdict: reportData.statusVerdict || '채점 완료',
              grading_report: reportData,
            })
            .select('id')
            .single()

          if (saveErr) console.warn('[ExamWorkspace] 커스텀 채점 영구 저장 오류:', saveErr.message)
          else {
            console.log('[ExamWorkspace] 커스텀 채점 리포트 DB 저장 성공!')
            if (insertData?.id) {
              setSelectedSubmissionId(insertData.id)
              if (typeof window !== 'undefined') {
                try {
                  const subKey = getActiveSubKey(selectedExamId, activeQuestion)
                  const reportKey = getActiveReportKey(selectedExamId, activeQuestion)
                  const reportJson = JSON.stringify(reportData)
                  localStorage.setItem(subKey, insertData.id)
                  localStorage.setItem(reportKey, reportJson)
                  localStorage.setItem('nonsul_active_grading_report', reportJson)
                } catch {}
              }
            }
            fetchSubmissionHistory()
          }
        } catch (dbErr) {
          console.warn('[ExamWorkspace] 커스텀 채점 DB 저장 예외:', dbErr)
        }
      }

      onReport(reportData, activeQuestion as 'q1' | 'q2')
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('커스텀 프롬프트 채점이 사용자에 의해 중단되었습니다.')
        return
      }
      console.warn('커스텀 프롬프트 채점 오류:', err)
      alert(`커스텀 프롬프트 채점 오류: ${err.message}`)
    } finally {
      clearTimeout(t1)
      clearTimeout(t2)
      abortControllerRef.current = null
      setIsGrading(false)
    }
  }

  // Gemini API를 호출하여 공식 채점 기준표에 따라 실시간 채점을 수행하는 핸들러
  const handleSubmitAndGrade = async () => {
    // 1. 비로그인 게스트인 경우: 로그인 모달 호출
    if (!user) {
      openAuthModal('login')
      alert('AI 정밀 첨삭 및 채점 리포트를 발급받으시려면 먼저 로그인해 주세요.')
      return
    }

    // 2. 답안 최소 글자 수 확인
    const trimmed = currentAnswer.trim()
    if (!trimmed || trimmed.length < 30) {
      alert('답안을 최소 30자 이상 작성하신 후 정밀 채점을 요청해 주세요.\n(원활한 채점을 위해 모범답안을 불러오거나 직접 서술해 보세요.)')
      return
    }

    // 3. 관리자(admin)가 아닌 일반 학생의 경우 채점 요청 전 자격(잔여 크레딧, 쿨다운, 5회 상한)만 먼저 검증 (차감은 채점 완료 후 수행)
    if (!isAdmin) {
      if (remainingCredits <= 0) {
        openPurchaseModal()
        return
      }

      const eligibility = await checkCreditEligibility(selectedExamId || 'common', activeQuestion)
      if (!eligibility.success) {
        if (eligibility.code === 'COOLDOWN_ACTIVE') {
          const mins = Math.ceil((eligibility.cooldown_remaining_seconds || 60) / 60)
          alert(`[제출 쿨다운 안내]\n이전 첨삭 리포트를 충분히 복습하고 개선할 수 있도록 대기 시간(약 ${mins}분 남음)이 적용 중입니다. 피드백을 반영하여 답안을 퇴고해 보세요!`)
          return
        }
        if (eligibility.code === 'MAX_ATTEMPTS_EXCEEDED') {
          alert(`[문항 한도 초과]\n해당 문항은 이미 최대 5회 채점을 완료하여 마스터하셨습니다.\n다른 기출/모의 문항에 도전해 보세요!`)
          return
        }
        if (eligibility.code === 'NO_CREDITS') {
          openPurchaseModal()
          return
        }
        alert(eligibility.message || '채점 크레딧 확인 중 오류가 발생했습니다.')
        return
      }
    }

    setIsGrading(true)
    setGradingStep(1)

    // 사용자가 '중단하기'를 클릭할 때만 요청을 중단하도록 AbortController 연결 (지연 시 자동 중단 없음)
    const controller = new AbortController()
    abortControllerRef.current = controller

    // 학생이 기다리는 동안 실시간 채점 진행 상태를 애니메이션으로 안내
    const t1 = setTimeout(() => setGradingStep(2), 2200)
    const t2 = setTimeout(() => setGradingStep(3), 4800)

    try {
      const res = await fetch('/api/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          university: currentUniv,
          examTitle: currentQ.tag || `${currentUniv} 수시 논술`,
          questionLabel: currentQ.label,
          questionTitle: currentQ.title,
          charLimit: currentQ.limit || '800±100자',
          passages: currentQ.passages,
          rubric: currentQ.rubric,
          modelAnswer: currentQ.modelAnswer,
          questionPdfUrl: currentQ.questionPdfUrl || '',
          rawRubricText: currentQ.rawRubricText || '',
          rubricPdfUrl: currentQ.rubricPdfUrl || '',
          scoringSystem: currentQ.scoringSystem || null,
          studentAnswer: currentAnswer,
          studentName: '수험생',
        }),
      })

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson?.error || '채점 분석 서버 응답 오류가 발생했습니다.')
      }

      const reportData: GradingReportData = await res.json()

      // 4. AI 채점 리포트 생성이 완전히 성공한 직후에만 크레딧 1회 차감 (실패/취소 시 차감 및 증감 오차 원천 차단)
      if (!isAdmin) {
        await consumeCredit(selectedExamId || 'common', activeQuestion)
      }

      // 로그인된 수험생/관리자의 경우 DB에 답안 및 채점 리포트 영구 저장
      if (user) {
        try {
          const { data: insertData, error: saveErr } = await supabase
            .from('student_submissions')
            .insert({
              user_id: user.id,
              exam_id: selectedExamId,
              exam_title: currentQ.tag || `${currentUniv} 수시 논술`,
              university: currentUniv,
              question_label: currentQ.label || '문항 1',
              student_answer: currentAnswer,
              char_count: currentAnswer.length,
              total_score: reportData.totalScore || 0,
              status_verdict: reportData.statusVerdict || '채점 완료',
              grading_report: reportData,
            })
            .select('id')
            .single()

          if (saveErr) console.warn('[ExamWorkspace] 답안 영구 저장 오류:', saveErr.message)
          else {
            console.log('[ExamWorkspace] 답안 및 채점 리포트 DB 저장 성공!')
            if (insertData?.id) {
              setSelectedSubmissionId(insertData.id)
              if (typeof window !== 'undefined') {
                try {
                  const subKey = getActiveSubKey(selectedExamId, activeQuestion)
                  const reportKey = getActiveReportKey(selectedExamId, activeQuestion)
                  const reportJson = JSON.stringify(reportData)
                  localStorage.setItem(subKey, insertData.id)
                  localStorage.setItem(reportKey, reportJson)
                  localStorage.setItem('nonsul_active_grading_report', reportJson)
                } catch {}
              }
            }
            fetchSubmissionHistory()
          }
        } catch (dbErr) {
          console.warn('[ExamWorkspace] 답안 DB 저장 예외:', dbErr)
        }
      }

      onReport(reportData, activeQuestion)
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('채점 요청이 사용자에 의해 안전하게 취소되었습니다. (크레딧 미차감)')
        return
      }
      console.warn('AI 채점 일시 지연 발생 (크레딧 미차감):', err)
      setGradingNotice('현재 AI 채점 서버 이용량이 많아 일시 지연되었습니다. 크레딧은 차감되지 않았으며, 작성하신 답안은 안전하게 보존되어 있으니 잠시 후 다시 제출해 주세요.')
      setTimeout(() => {
        setGradingNotice(null)
      }, 6000)
    } finally {
      clearTimeout(t1)
      clearTimeout(t2)
      abortControllerRef.current = null
      setIsGrading(false)
    }
  }

  return (
    <main className="exam-shell">
      <header className="topbar">
        <Brand onHome={onHome} />
        <div className="topbar-controls">
          {/* 대학 패스 크레딧 상태 표시 */}
          {isAdmin ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-xs font-semibold">
              <Sparkles size={14} className="text-amber-400" />
              <span>관리자 (무제한)</span>
            </div>
          ) : user ? (
            <button
              type="button"
              onClick={openPurchaseModal}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                remainingCredits > 0
                  ? 'bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/35 text-blue-300'
                  : 'bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 animate-pulse'
              }`}
              title="클릭하여 이용권 확인 및 채점권 추가 충전"
            >
              <Coins size={14} className={remainingCredits > 0 ? 'text-blue-400' : 'text-amber-400'} />
              <span>패스 크레딧: <strong>{remainingCredits}회</strong></span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => openAuthModal('login')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 text-xs font-semibold transition cursor-pointer"
            >
              <span>로그인 후 응시</span>
            </button>
          )}

          <div className="mode-toggle">
            <button type="button" className="active" title="현재 원고지 답안 작성 화면입니다">
              응시 모드
            </button>
            <button
              type="button"
              onClick={handleGoToReportMode}
              title="이 문항의 최신 AI 정밀 채점 리포트 화면으로 이동"
            >
              리포트
            </button>
          </div>
          {/* ⏱️ 경과 시간 스톱워치 (시:분 표시 + ON/OFF 토글 + 리셋) */}
          <div className="timer">
            <Clock3 className={isTimerRunning ? 'timer-icon-active' : ''} />
            <strong className="timer-time" title="경과 시간 (시:분)">
              {elapsedHoursStr}
              <span className={isTimerRunning ? 'timer-colon-blink' : ''}>:</span>
              {elapsedMinutesStr}
            </strong>
            <button
              type="button"
              role="switch"
              aria-checked={isTimerRunning}
              onClick={handleToggleTimer}
              className={`timer-toggle ${isTimerRunning ? 'on' : 'off'}`}
              title={isTimerRunning ? '타이머 일시정지 (OFF)' : '타이머 시작 (ON)'}
            >
              <span className="timer-toggle-knob" />
            </button>
            <button
              type="button"
              onClick={handleResetTimer}
              disabled={elapsedSeconds === 0 && !isTimerRunning}
              className="timer-reset-btn"
              title="타이머 초기화 (00:00)"
            >
              <RotateCcw size={13} />
            </button>
          </div>
        </div>
      </header>

      <div className="context-bar">
        <div className="breadcrumb">
          논술패스 <span className="slash">/</span>{' '}
          {onBack ? (
            <button type="button" className="breadcrumb-link-btn" onClick={onBack} title={`${currentUniv} 분석 페이지로 이동`}>
              {currentUniv} 분석
            </button>
          ) : (
            <strong>{currentUniv}</strong>
          )}{' '}
          <span className="slash">/</span> <strong>{currentQ.tag || `2026학년도 ${currentUniv} 수시`}</strong>{' '}
          <span className="slash">/</span> {currentQ.label}
        </div>
        {/* 관리자 전용: 현재 시험을 관리자 콘솔 'PDF 원문 간편 등록' 수정 모드로 바로 열기 */}
        {isAdmin && selectedExamId && (
          <button
            type="button"
            onClick={() => {
              const univId = getUniversityId(currentUniv) || (selectedExamId.includes('-') ? selectedExamId.split('-')[0] : 'hongik')
              const currentUrl = typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : ''
              const adminUrl = `/admin?univ=${encodeURIComponent(univId)}&tab=pdf-upload&editExamId=${encodeURIComponent(selectedExamId)}&returnUrl=${encodeURIComponent(currentUrl)}`
              window.location.href = adminUrl
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 11px',
              borderRadius: '6px',
              border: '1px solid #c7d2fe',
              backgroundColor: '#eef2ff',
              color: '#3730a3',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
            title="관리자 콘솔 'PDF 원문 간편 등록' 화면으로 이동하여 이 시험의 문항·페이지 분할·채점기준을 수정합니다"
          >
            <Pencil size={12} />
            <span>이 시험 수정</span>
          </button>
        )}
      </div>

      <div className={currentQ.displayMode === 'pdf' && currentQ.questionPdfUrl ? 'workspace pdf-mode' : 'workspace'}>
        <section className="reading-panel">
          {/* PDF 문제지 모드에서는 상단 context-bar와 중복되는 대학명/제목 헤더를 숨겨 세로 열람 면적을 극대화 */}
          {!(currentQ.displayMode === 'pdf' && currentQ.questionPdfUrl) && (
            <div className="panel-heading">
              <div>
                <p className="eyebrow">
                  {currentUniv.includes('경희')
                    ? 'KYUNG HEE UNIVERSITY · ESSAY EXAM'
                    : currentUniv.includes('동국')
                    ? 'DONGGUK UNIVERSITY · ESSAY EXAM'
                    : currentUniv.includes('홍익')
                    ? 'HONGIK UNIVERSITY · ESSAY EXAM'
                    : `${currentUniv.toUpperCase()} · ESSAY EXAM`}
                </p>
                <h1>{currentQ.tag || `${currentUniv} 논술고사`}</h1>
              </div>
            </div>
          )}
          <div className="question-tabs" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {(() => {
              const qKeys = Object.keys(questionsData).filter(k => questionsData[k] && questionsData[k].passages)
              // 탭 표시용 문항 라벨 포맷터: 소문항("1-1", "[문항 2-1]" 등)은 "문제 1-1", "문제 2-1" 형식으로 통일
              const getTabLabel = (qKey: string, idx: number): string => {
                const raw = (questionsData[qKey]?.label || '').trim()
                if (!raw) return `문제 ${idx + 1}`
                const subMatch = raw.match(/(\d+)\s*[-–]\s*(\d+)/)
                if (subMatch) return `문제 ${subMatch[1]}-${subMatch[2]}`
                return raw
              }
              const getMajorGroup = (tabLabel: string): string | null => {
                const m = tabLabel.match(/(\d+)-(\d+)$/)
                return m ? m[1] : null
              }

              return (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: qKeys.length >= 4 ? '14px' : '24px',
                    flexWrap: 'wrap',
                  }}
                >
                  {qKeys.map((qKey, idx) => {
                    const isAnswered = (answers[qKey] || '').trim().length > 0
                    const tabLabel = getTabLabel(qKey, idx)
                    const currMajor = getMajorGroup(tabLabel)
                    const prevMajor = idx > 0 ? getMajorGroup(getTabLabel(qKeys[idx - 1], idx - 1)) : null
                    const showGroupDivider = Boolean(currMajor && prevMajor && currMajor !== prevMajor)

                    return (
                      <React.Fragment key={qKey}>
                        {showGroupDivider && (
                          <span
                            aria-hidden="true"
                            style={{
                              width: '1px',
                              height: '14px',
                              backgroundColor: '#cbd5e1',
                              marginBottom: '6px',
                            }}
                          />
                        )}
                        <button
                          className={activeQuestion === qKey ? 'active' : ''}
                          onClick={() => setActiveQuestion(qKey)}
                          title={questionsData[qKey]?.label || tabLabel}
                        >
                          {tabLabel} {isAnswered && <span className="tab-check"><Check /></span>}
                        </button>
                      </React.Fragment>
                    )
                  })}
                </div>
              )
            })()}

            {/* PDF 문제지 모드 전용: 문제 탭 우측 한 줄에 확대/축소 및 새 창 확대 컨트롤 통합 배치 */}
            {currentQ.displayMode === 'pdf' && currentQ.questionPdfUrl && (
              <div className="pdf-tab-controls">
                {currentQ.questionPdfStartPage && currentQ.questionPdfStartPage > 1 && (
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#2563eb',
                      background: '#eff6ff',
                      padding: '2px 7px',
                      borderRadius: '9999px',
                      border: '1px solid #bfdbfe',
                    }}
                  >
                    {currentQ.questionPdfStartPage}p~
                  </span>
                )}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    overflow: 'hidden',
                  }}
                >
                  <button
                    type="button"
                    onClick={handleZoomOutPdf}
                    disabled={pdfZoom <= PDF_ZOOM_MIN}
                    title="PDF 5% 축소"
                    style={{
                      padding: '3px 8px',
                      border: 'none',
                      background: 'transparent',
                      color: pdfZoom <= PDF_ZOOM_MIN ? '#cbd5e1' : '#334155',
                      fontSize: '13px',
                      fontWeight: 800,
                      cursor: pdfZoom <= PDF_ZOOM_MIN ? 'not-allowed' : 'pointer',
                      lineHeight: 1.2,
                    }}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    onClick={() => setPdfZoom(PDF_ZOOM_DEFAULT)}
                    title="기본 130% 크기로 초기화"
                    style={{
                      padding: '3px 7px',
                      border: 'none',
                      borderLeft: '1px solid #e2e8f0',
                      borderRight: '1px solid #e2e8f0',
                      background: '#f8fafc',
                      color: '#1e3a8a',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      minWidth: '46px',
                      textAlign: 'center',
                    }}
                  >
                    {pdfZoom}%
                  </button>
                  <button
                    type="button"
                    onClick={handleZoomInPdf}
                    disabled={pdfZoom >= PDF_ZOOM_MAX}
                    title="PDF 5% 확대"
                    style={{
                      padding: '3px 8px',
                      border: 'none',
                      background: 'transparent',
                      color: pdfZoom >= PDF_ZOOM_MAX ? '#cbd5e1' : '#334155',
                      fontSize: '13px',
                      fontWeight: 800,
                      cursor: pdfZoom >= PDF_ZOOM_MAX ? 'not-allowed' : 'pointer',
                      lineHeight: 1.2,
                    }}
                  >
                    +
                  </button>
                </div>

                <a
                  href={`${currentQ.questionPdfUrl}#page=${currentQ.questionPdfStartPage || 1}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 9px',
                    borderRadius: '6px',
                    backgroundColor: '#eff6ff',
                    color: '#2563eb',
                    border: '1px solid #bfdbfe',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    textDecoration: 'none',
                  }}
                >
                  <BookOpen size={12} />
                  새 창 확대
                </a>
              </div>
            )}
          </div>

          <div className="reading-scroll">
            {currentQ.displayMode === 'pdf' && currentQ.questionPdfUrl ? (
              /* B-1. 하이브리드 PDF 원문 뷰어 모드 (별도 상단 바 제거로 문제지 세로 면적 최대화) */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', height: '100%' }}>
                {currentQ.note && (
                  <div style={{ padding: '8px 12px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '12.5px', color: '#334155', whiteSpace: 'pre-wrap' }}>
                    {currentQ.note}
                  </div>
                )}

                <div className="pdf-viewer-frame-wrap">
                  {/* PDF.js 캔버스 뷰어: 어두운 브라우저 회색 여백 없이 100% 흰색 배경 + 110% 가로폭 맞춤 */}
                  <CleanPdfViewer
                    url={currentQ.questionPdfUrl}
                    startPage={currentQ.questionPdfStartPage || 1}
                    questionKey={currentQ.id}
                    zoom={pdfZoom}
                    baseZoom={PDF_ZOOM_BASE}
                  />
                </div>
              </div>
            ) : (
              /* B-2. 일반 학생 응시 및 기본 텍스트 열람 뷰 (기존 기출 100% 하위 호환) */
              <>
                <article className="prompt-card">
                  {(() => {
                    const rawTitle = currentQ.title || ''
                    const match = rawTitle.match(/^(【.*?】)(.*)/)
                    const header = match ? match[1].trim() : (rawTitle.startsWith('【') ? rawTitle : `【${currentQ.label || '문제 1'}】`)
                    const titleSubtitle = (match && match[2].trim()) ? match[2].trim() : ''
                    const noteText = currentQ.note || ''

                    // 소제목과 문제 전문을 누락 없이 스마트하게 통합
                    let body = ''
                    if (titleSubtitle && noteText) {
                      body = noteText.includes(titleSubtitle) ? noteText : `${titleSubtitle}\n\n${noteText}`
                    } else {
                      body = titleSubtitle || noteText
                    }
                    return (
                      <>
                        <div className="prompt-title-row">
                          <h2>{header}</h2>
                        </div>
                        {body && (
                          <div className="prompt-body-text">
                            {body
                              .split(/\r?\n\r?\n/)
                              .map((b) => b.trim())
                              .filter(Boolean)
                              .map((bPara, bIdx) => renderFormattedParagraph(bPara, `prompt-body-${bIdx}`))}
                          </div>
                        )}
                      </>
                    )
                  })()}
                </article>

                {/* 실제 기출 제시문 목록 */}
                <div className="passage-block">
                  {currentQ.passages.map((p, idx) => (
                    <section key={idx} className="passage-card">
                      <div className="passage-header">
                        <span className="passage-badge">{p.badge}</span>
                      </div>
                      <div className="passage-body">
                        {p.paragraphs.map((para, pIdx) => renderFormattedParagraph(para, `p-${idx}-${pIdx}`))}
                      </div>
                    </section>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        <div className="splitter">
          <span />
        </div>

        <section className="writing-panel">
          <div className="editor-heading">
            <div>
              <h2 className="editor-main-title">나의 답안 작성</h2>
            </div>
            <div className="editor-top-actions">
              <div className="editor-counts">
                <span className="count-badge active">
                  공백 제외 <strong>{currentAnswer.replace(/\s/g, '').length}</strong>자
                </span>
                <span className="count-badge sub">
                  공백 포함 {currentAnswer.length}자
                </span>
                <span className="count-rule">
                  규정: {currentQ.limit || '700~900자 (800±100자)'}
                </span>
                <span
                  className="save-state-badge"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11.5px',
                    color: '#16a34a',
                    fontWeight: 600,
                    backgroundColor: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    padding: '2px 8px',
                    borderRadius: '6px'
                  }}
                  title="답안이 실시간으로 자동 보존되고 있습니다"
                >
                  <Check size={12} strokeWidth={2.5} />
                  <span>자동 저장 중</span>
                </span>
              </div>
            </div>
          </div>
          <div className="progress-track">
            <span style={{ width: `${Math.min(currentAnswer.replace(/\s/g, '').length / 9, 100)}%` }} />
          </div>

          {loadNotice && (
            <div
              style={{
                marginTop: '10px',
                marginBottom: '4px',
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: '#eff6ff',
                border: '1px solid #bfdbfe',
                color: '#1e40af',
                fontSize: '12.5px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={16} color="#2563eb" />
                <span>{loadNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setLoadNotice(null)}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '2px' }}
              >
                <X size={14} />
              </button>
            </div>
          )}

          <div className="editor-wrap">
            <textarea
              aria-label="나의 답안 작성"
              placeholder={currentQ.placeholder}
              value={currentAnswer}
              onChange={(e) => handleAnswerChange(e.target.value)}
              spellCheck={false}
            />
          </div>

          <div className="editor-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            {/* 최좌측 그룹: 원고지 작성 & 사진 입력 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {/* ▦ 원고지 작성 버튼 */}
              <button
                type="button"
                onClick={() => setShowManuscriptModal(true)}
                className="editor-btn-secondary"
                title="대학 논술 실전 원고지(400자·800자·1,000자) 팝업 에디터 열기"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  color: '#166534',
                  borderColor: '#86efac',
                  backgroundColor: '#f0fdf4',
                  fontWeight: 600
                }}
              >
                <span style={{ fontSize: '13px' }}>▦</span>
                <span>원고지 작성</span>
              </button>

              {/* 📷 사진 입력 버튼 */}
              <button
                type="button"
                onClick={() => {
                  if (!isAdmin && remainingCredits <= 0) {
                    alert('사진 입력(AI 손글씨 변환)을 이용하려면 패스 크래딧이 1회 이상 필요합니다. 크래딧 충전 페이지로 이동합니다.')
                    openPurchaseModal()
                    return
                  }
                  setShowOcrModal(true)
                }}
                className="editor-btn-secondary"
                title="실제 원고지나 노트에 손글씨로 작성한 글을 폰 카메라로 찍어 올리면 Gemini AI가 텍스트로 자동 변환합니다"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  color: '#4338ca',
                  borderColor: '#c7d2fe',
                  backgroundColor: '#eef2ff',
                  fontWeight: 600
                }}
              >
                <Camera size={14} />
                <span>사진 입력</span>
              </button>
            </div>

            {/* 최우측 그룹: 모범 답안 & 답안 복사 & 지우기 */}
            <div className="editor-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className="editor-btn-secondary"
                onClick={() => setShowModelModal(true)}
                title={`${currentQ.label} 공식 모범 답안 보기`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                <BookOpen size={14} />
                <span>모범 답안</span>
              </button>
              <button
                type="button"
                className="editor-btn-secondary"
                onClick={() => {
                  navigator.clipboard.writeText(currentAnswer)
                  alert('답안이 클립보드에 복사되었습니다.')
                }}
                title="답안 클립보드 복사"
              >
                답안 복사
              </button>
              <button
                type="button"
                className="editor-btn-secondary"
                onClick={() => {
                  if (confirm(`${currentQ.label} 답안을 모두 지우고 새로 작성하시겠습니까?`)) {
                    handleAnswerChange('')
                    setSelectedSubmissionId(null)
                    if (typeof window !== 'undefined') {
                      try {
                        const subKey = getActiveSubKey(selectedExamId, activeQuestion)
                        const reportKey = getActiveReportKey(selectedExamId, activeQuestion)
                        localStorage.removeItem(subKey)
                        localStorage.removeItem(reportKey)
                      } catch {}
                    }
                  }
                }}
                title="답안 초기화"
              >
                <RotateCcw className="w-3.5 h-3.5" /> 지우기
              </button>
            </div>
          </div>
          <div className="writing-tip">
            <Lightbulb />
            <p>
              <strong>{currentQ.tipTitle}</strong>
              <br />
              {currentQ.tipDesc}
            </p>
          </div>

          {/* 공식 채점 기준표 + (우측) 채점 프롬프트 보기 · 채점 및 리포트 보기 통합 액션 바 */}
          <div className="rubric-btn-wrap">
            <button
              type="button"
              className="rubric-open-btn"
              onClick={() => setShowRubricModal(true)}
              title={`${currentQ.label} 공식 채점 기준표 및 배점표 확인`}
            >
              <ClipboardList size={14} /> {currentQ.label} 공식 채점 기준표 보기
            </button>

            <div className="rubric-right-actions">
              {/* 관리자 전용: 채점 프롬프트 실시간 검사 및 튜닝 모달 오픈 버튼 */}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowPromptInspector(true)}
                  className="admin-inspector-btn"
                  title="현재 문항 채점 시 AI로 전송되는 프롬프트를 확인하고 즉석 튜닝합니다"
                >
                  <Terminal size={14} />
                  <span>채점 프롬프트 보기</span>
                </button>
              )}
              <Button className="bottom-submit-btn" onClick={handleSubmitAndGrade} disabled={isGrading}>
                {isGrading ? <Loader2 className="animate-spin" size={15} /> : null}
                {isGrading ? 'AI 채점 진행 중...' : '채점 및 리포트 보기'} <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
          </div>

          {/* 채점 관련 안내·경고 배너 */}
          {gradingNotice && (
            <div className="grading-notice-banner" style={{ marginTop: '10px' }}>
              <AlertTriangle className="grading-notice-icon" />
              <span>{gradingNotice}</span>
            </div>
          )}

          {/* 📝 수험생 이전 제출 및 첨삭 이력 (날짜순 정렬 카드 리스트) */}
          <SubmissionHistorySection
            questionLabel={currentQ.label}
            questionMaxScore={currentQ.scoringSystem?.maxScore || currentQ.points || 100}
            submissionHistory={submissionHistory}
            isLoadingHistory={isLoadingHistory}
            isLoggedIn={Boolean(user)}
            selectedSubmissionId={selectedSubmissionId}
            onOpenLogin={() => openAuthModal('login')}
            onToggleCard={handleToggleSubmissionCard}
            onDeleteSubmission={handleDeleteSubmission}
          />
        </section>
      </div>

      {/* 공식 모범답안 모달 */}
      <ModelAnswerModal
        isOpen={showModelModal}
        onClose={() => setShowModelModal(false)}
        currentQ={currentQ}
        currentAnswer={currentAnswer}
        onApplyAnswer={handleAnswerChange}
      />

      {/* 공식 채점 기준표 팝업 모달 */}
      <RubricModal
        isOpen={showRubricModal}
        onClose={() => setShowRubricModal(false)}
        currentUniv={currentUniv}
        currentQ={currentQ}
      />

      {/* 🔍 관리자 전용 채점 프롬프트 검사 및 실시간 튜닝 모달 */}
      <PromptInspectorModal
        isOpen={showPromptInspector}
        onClose={() => setShowPromptInspector(false)}
        university={currentUniv}
        examTitle={currentQ.tag || `${currentUniv} 수시 논술`}
        questionLabel={currentQ.label}
        questionTitle={currentQ.title}
        charLimit={currentQ.limit || '800±100자'}
        passages={currentQ.passages}
        rubric={currentQ.rubric}
        modelAnswer={currentQ.modelAnswer}
        questionPdfUrl={currentQ.questionPdfUrl}
        rawRubricText={currentQ.rawRubricText}
        rubricPdfUrl={currentQ.rubricPdfUrl}
        scoringSystem={currentQ.scoringSystem}
        studentAnswer={currentAnswer}
        onRunCustomGrade={handleRunCustomGrade}
        isGrading={isGrading}
      />

      {/* ▦ 실전 200자 정통 원고지 한 칸 정밀 입력 팝업 모달 */}
      <ManuscriptModal
        isOpen={showManuscriptModal}
        onClose={() => setShowManuscriptModal(false)}
        value={currentAnswer}
        onChange={handleAnswerChange}
        questionLabel={currentQ.label || '문항 1'}
        targetLimit={currentQ.limit || '800±100자'}
      />

      {/* 📷 손글씨/원고지 사진 다중 업로드 및 Gemini AI 텍스트 변환(OCR) 팝업 모달 */}
      <HandwritingOcrModal
        isOpen={showOcrModal}
        onClose={() => setShowOcrModal(false)}
        onApplyText={(text, mode) => {
          if (mode === 'append') {
            const separator = currentAnswer.trim() ? '\n\n' : ''
            handleAnswerChange(currentAnswer + separator + text)
          } else {
            handleAnswerChange(text)
          }
        }}
        currentAnswer={currentAnswer}
        questionLabel={currentQ.label || '문항 1'}
        charLimit={currentQ.limit || '800±100자'}
        remainingCredits={remainingCredits}
        isAdmin={isAdmin}
        onConsumeOcrCredit={consumeOcrCredit}
        onOpenPurchaseModal={() => {
          setShowOcrModal(false)
          openPurchaseModal()
        }}
      />

      {/* AI 채점 진행 오버레이 모달 */}
      <GradingLoadingOverlay
        isGrading={isGrading}
        gradingStep={gradingStep}
        onCancelGrading={handleCancelGrading}
      />

      {/* 💳 대학별 30일 마스터 패스 및 채점권 결제 모달 */}
      <PassPurchaseModal
        isOpen={isPurchaseModalOpen}
        onClose={closePurchaseModal}
        university={currentUniv}
        onGrantPass={grantPass}
      />
    </main>
  )
}
