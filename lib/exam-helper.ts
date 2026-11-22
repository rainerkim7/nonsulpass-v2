/**
 * @file lib/exam-helper.ts
 * @description 대학별(홍익대, 경희대, 동국대 등) 시험 ID에 따른 문항 및 제시문, 채점기준 프리셋 반환 및 Supabase DB 동적 연동 헬퍼
 */

import { supabase } from '@/lib/supabase'

export interface QuestionPassage {
  badge: string
  paragraphs: string[]
}

export interface RubricItemSub {
  name: string
  desc: string
  points: string
}

export interface RubricCategoryItem {
  category: string
  subItems: RubricItemSub[]
}

export interface QuestionRubric {
  facultyWeight?: string
  totalScore: string
  items: RubricCategoryItem[]
  deductions: string[]
}

export interface QuestionScoringSystem {
  /** 채점 방식: 'score'(원배점 점수제) | 'grade'(등급제) | 'both'(등급+원배점 병기) */
  type: 'score' | 'grade' | 'both'
  /** 문항 원만점 (예: 30, 40, 50, 100) */
  maxScore: number
  /** 대학 공식 등급 체계 목록 (예: ['A+', 'A', 'B+', 'B', 'C', 'D', 'F']) */
  gradeScale?: string[]
  /** 예상 합격선 안내 문구 (예: 'A 이상 / 100점 환산 82점') */
  cutlineLabel?: string
}

export interface QuestionData {
  id: string
  label: string
  tag: string
  title: string
  note: string
  limit: string
  points?: number
  scoringCriteria?: any[]
  keyArguments?: string[]
  placeholder: string
  passages: QuestionPassage[]
  tipTitle: string
  tipDesc: string
  modelAnswer: string
  modalTitle: string
  modalPill: string
  modalLength: string
  modalCallout: string
  rubric: QuestionRubric
  pdfUrl?: string
  pdfName?: string
  // --- 하이브리드 PDF 원문 제공 + 대학 고유 채점기준 지원 필드 ---
  /** 문항 표시 모드: 'pdf'(문항별 PDF 뷰어) | 'text'(기존 텍스트 제시문) */
  displayMode?: 'text' | 'pdf'
  /** 문항별 문제지 PDF URL (개별 PDF 또는 통합 PDF URL) */
  questionPdfUrl?: string
  /** 문항별 문제지 PDF 원본 파일명 */
  questionPdfName?: string
  /** 통합 PDF 사용 시 해당 문항 시작 페이지 번호 (1부터 시작) */
  questionPdfStartPage?: number
  /** 대학 공식 채점기준·출제의도·등급표 원문 텍스트 (가공 없이 그대로 저장) */
  rawRubricText?: string
  /** 대학 공식 채점기준·해설 PDF URL */
  rubricPdfUrl?: string
  /** 대학 공식 채점기준·해설 PDF 원본 파일명 */
  rubricPdfName?: string
  /** 대학 고유 배점·등급 체계 설정 */
  scoringSystem?: QuestionScoringSystem
}

export interface QuestionsMap {
  q1: QuestionData
  q2: QuestionData
  [key: string]: QuestionData
}

/**
 * DB에 저장된 다양한 형태의 questions 데이터(배열 또는 q1/q2 객체)를
 * 프론트엔드 표준 QuestionsMap 형태로 완벽히 정규화(Normalize)하는 헬퍼 함수
 */
export function normalizeQuestionsData(rawQuestions: any, examMeta?: any): QuestionsMap {
  if (!rawQuestions) return getQuestionsData(examMeta?.id)

  // 1. 이미 { q1: {...}, q2: {...} } 형태인 경우 (텍스트 모드 및 PDF 모드 모두 지원)
  if (rawQuestions.q1 && (rawQuestions.q1.passages || rawQuestions.q1.questionPdfUrl || rawQuestions.q1.displayMode === 'pdf')) {
    if (examMeta?.pdf_url !== undefined || examMeta?.pdfUrl !== undefined) {
      const pUrl = examMeta?.pdf_url ?? examMeta?.pdfUrl ?? ''
      const pName = examMeta?.pdf_name ?? examMeta?.pdfName ?? ''
      Object.keys(rawQuestions).forEach(k => {
        if (rawQuestions[k]) {
          if (!Array.isArray(rawQuestions[k].passages)) rawQuestions[k].passages = []
          // DB 테이블 컬럼(exams.pdf_url)에 최신 PDF가 설정되어 있으면 최우선 동기화
          if (pUrl || !rawQuestions[k].pdfUrl) rawQuestions[k].pdfUrl = pUrl
          if (pName || !rawQuestions[k].pdfName) rawQuestions[k].pdfName = pName
        }
      })
    }
    return rawQuestions as QuestionsMap
  }

  // 2. [ {...}, {...} ] 배열 형태인 경우 (홍익대 데이터셋 또는 올인원 추출기 파싱 결과)
  if (Array.isArray(rawQuestions) && rawQuestions.length > 0) {
    const map: any = {}
    rawQuestions.forEach((q: any, idx: number) => {
      const qKey = `q${idx + 1}`
      const passages: QuestionPassage[] = (q.passages || []).map((p: any, pIdx: number) => {
        // 실제 시험지 원문 원칙: 임의의 요약 제목(title)은 절대 뱃지로 노출하지 않음
        let badge = p.badge
        if (!badge && p.id && typeof p.id === 'string' && (p.id.startsWith('[') || p.id.startsWith('제시문'))) {
          badge = p.id.startsWith('[') ? `[제시문 ${p.id.replace(/[\[\]]/g, '')}]` : p.id
        }
        if (!badge) {
          const hangulLabels = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차']
          badge = `[제시문 ${hangulLabels[pIdx] || pIdx + 1}]`
        }
        return {
          badge,
          paragraphs: Array.isArray(p.paragraphs)
            ? p.paragraphs
            : p.content
            ? p.content.split(/\r?\n\r?\n/).map((s: string) => s.trim()).filter(Boolean)
            : []
        }
      })

      // 실제 시험지 원칙: 임의의 소제목(예: "[가치 있는 기록...]")을 제거하고 오직 시험지 고유 식별 번호만 유지
      let rawLabel = q.label || ''
      if (!rawLabel && q.title) {
        // 【논제 Ⅰ】, 【문제 1】, [문제 1] 등의 대괄호 안 식별자 우선 추출
        const bracketMatch = q.title.match(/【(.*?)】|\[(.*?)\]/)
        if (bracketMatch) {
          rawLabel = (bracketMatch[1] || bracketMatch[2] || '').trim()
        } else {
          rawLabel = q.title.split('.')[0].replace(/【|】/g, '').trim()
        }
      }
      if (!rawLabel || rawLabel.length > 15) {
        rawLabel = `문제 ${idx + 1}`
      }
      const cleanLabel = rawLabel.replace(/\s*[\.·]?\s*\[.*?\]/g, '').trim()
      const titleNumber = cleanLabel.startsWith('【') ? cleanLabel : `【${cleanLabel.replace(/문항/g, '문제')}】`

      // 실제 출제 문제 발문 전문
      let cleanNote = q.questionText || q.note || ''
      if (!cleanNote && q.title) {
        const parts = q.title.split(/【.*?】/)
        if (parts.length > 1 && parts[1].trim()) {
          cleanNote = parts[1].trim()
        }
      }

      const numericPoints = Number(q.points ?? q.score) || 50

      map[qKey] = {
        id: qKey,
        label: cleanLabel.replace(/【|】/g, '').trim(),
        tag: q.tag || examMeta?.title || `${examMeta?.year || ''} ${cleanLabel}`,
        title: titleNumber,
        note: cleanNote,
        limit: q.limit || q.targetLength || '800±100자',
        points: numericPoints,
        scoringCriteria: Array.isArray(q.scoringCriteria) ? q.scoringCriteria : undefined,
        keyArguments: Array.isArray(q.keyArguments) ? q.keyArguments : undefined,
        placeholder: q.placeholder || `여기에 ${cleanLabel} 답안을 작성하세요.`,
        passages: passages,
        tipTitle: q.tipTitle || '출제위원 핵심 채점 팁',
        tipDesc: q.tipDesc || q.keyArguments?.join(' · ') || '제시문의 핵심 논점을 정확히 비교·분석하고 완결된 문장으로 서술하세요.',
        modelAnswer: q.modelAnswer || '모범 답안을 준비 중입니다.',
        modalTitle: q.modalTitle || `${q.label || `문항 ${idx + 1}`} 공식 예시(모범) 답안`,
        modalPill: q.modalPill || `${examMeta?.year || ''} 문항 ${idx + 1}`,
        modalLength: q.modalLength || `${q.targetLength || q.limit || '800자 내외'} 충족`,
        modalCallout: q.modalCallout || `💡 출제 핵심 포인트: ${q.keyArguments?.slice(0, 2).join(' / ') || '핵심 논점 분석'}`,
        // rubric 지능형 매핑: q.rubric -> q.scoringCriteria -> 로컬 프리셋 fallback
        rubric: (() => {
          if (q.rubric && Array.isArray(q.rubric.items) && q.rubric.items.length > 0) {
            return q.rubric
          }
          if (Array.isArray(q.scoringCriteria) && q.scoringCriteria.length > 0) {
            return {
              facultyWeight: examMeta?.targetFaculty || examMeta?.target_faculty || '인문·사회계열',
              totalScore: `${numericPoints}점 만점 (정밀채점 100점 환산)`,
              items: [
                {
                  category: '채점 기준 등급별 평가 요소',
                  subItems: q.scoringCriteria.map((sc: any) => ({
                    name: `[${sc.grade}등급 (${sc.range})]`,
                    desc: sc.description,
                    points: sc.range
                  }))
                }
              ],
              deductions: [
                '지정 글자 수(±10% 범위) 미달 또는 초과 시 감점',
                '제시문 문장을 그대로 복사하거나 핵심 논점을 오독한 경우 감점'
              ]
            }
          }
          return {
            facultyWeight: examMeta?.targetFaculty || examMeta?.target_faculty || '인문·사회계열',
            totalScore: `${numericPoints}점 만점 (정밀채점 100점 환산)`,
            items: [],
            deductions: [
              '지정 글자 수(±10% 범위) 미달 또는 초과 시 감점',
              '제시문 문장을 그대로 복사하거나 핵심 논점을 오독한 경우 감점'
            ]
          }
        })(),
        pdfUrl: examMeta?.pdf_url || examMeta?.pdfUrl || q.pdfUrl || q.pdf_url || '',
        pdfName: examMeta?.pdf_name || examMeta?.pdfName || q.pdfName || q.pdf_name || '',
        // 하이브리드 PDF 및 대학 고유 채점기준 필드 보존
        displayMode: q.displayMode || (q.questionPdfUrl ? 'pdf' : 'text'),
        questionPdfUrl: q.questionPdfUrl || '',
        questionPdfName: q.questionPdfName || '',
        questionPdfStartPage: q.questionPdfStartPage ? Number(q.questionPdfStartPage) : undefined,
        rawRubricText: q.rawRubricText || '',
        rubricPdfUrl: q.rubricPdfUrl || '',
        rubricPdfName: q.rubricPdfName || '',
        scoringSystem: q.scoringSystem || undefined,
      }
    })
    return map as QuestionsMap
  }

  return getQuestionsData(examMeta?.id)
}

/**
 * Supabase DB에서 해당 시험의 상세 정보 및 questions(문항/제시문)를 동적으로 조회
 */
export async function fetchExamQuestionsFromDb(examId: string): Promise<QuestionsMap | null> {
  try {
    const { data, error } = await supabase
      .from('exams')
      .select('*')
      .eq('id', examId)
      .single()

    if (error || !data || !data.questions) {
      return null
    }

    return normalizeQuestionsData(data.questions, data)
  } catch (err) {
    console.warn(`[fetchExamQuestionsFromDb] DB 조회 오류 (${examId}):`, err)
    return null
  }
}

/**
 * DB 비동기 조회 완료 전 초기 렌더링(블랭크 방지) 및 빈 시험 폴백을 위한 경량 표준 스켈레톤 반환 함수
 */
export function getQuestionsData(_examId?: string): QuestionsMap {
  const createEmptyQuestion = (num: number): QuestionData => ({
    id: `q${num}`,
    label: `문항 ${num}`,
    tag: `문항 ${num}`,
    title: `【문제 ${num}】`,
    note: '제시문을 불러오는 중이거나 등록된 발문이 없습니다.',
    limit: '800±100자',
    placeholder: `여기에 문항 ${num} 답안을 작성하세요.`,
    passages: [],
    tipTitle: '출제위원 핵심 채점 팁',
    tipDesc: '제시문의 핵심 논점을 정확히 비교·분석하고 완결된 문장으로 서술하세요.',
    modelAnswer: '등록된 예시(모범) 답안이 없습니다.',
    modalTitle: `문항 ${num} 공식 예시(모범) 답안`,
    modalPill: `문항 ${num}`,
    modalLength: '800자 내외 충족',
    modalCallout: '💡 출제 핵심 포인트: 핵심 논점 분석 및 논리적 서술',
    rubric: {
      facultyWeight: '인문·사회계열',
      totalScore: '50점 만점 (정밀채점 100점 환산)',
      items: [],
      deductions: [
        '지정 글자 수(±10% 범위) 미달 또는 초과 시 감점',
        '제시문 문장을 그대로 복사하거나 핵심 논점을 오독한 경우 감점'
      ]
    }
  })

  return {
    q1: createEmptyQuestion(1),
    q2: createEmptyQuestion(2)
  }
}
