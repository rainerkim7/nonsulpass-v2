/**
 * @file app/admin/components/pdf-uploader/types.ts
 * @description PDF 원문 간편 등록·수정기 공용 타입, 프리셋 및 대문항 자동 그룹화 유틸리티
 */

export interface DraftPdfQuestion {
  label: string
  limit: string
  note: string
  // 문항별 개별 PDF 또는 통합 PDF 시작 페이지
  questionPdfUrl: string
  questionPdfName: string
  questionPdfStartPage: number
  // 문항별 개별 페이지 재분할 범위 (상단 통합 PDF 기준)
  sliceFromPage?: number
  sliceToPage?: number
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

export interface QuestionGroup {
  key: string
  title: string
  majorNum: number | null
  isGrouped: boolean
  indices: number[]
}

export interface ExtractedScoringData {
  scoringRules: any[]
  rubrics: any[]
}

// 자주 쓰는 대학별 등급 체계 프리셋
export const GRADE_SCALE_PRESETS = [
  { label: 'A+~F (외대 등)', value: 'A+, A, B+, B, C+, C, D, F' },
  { label: 'S/A/B/C/D (동국대 등)', value: 'S, A, B, C, D' },
  { label: '상/중상/중/중하/하', value: '상, 중상, 중, 중하, 하' },
  { label: 'A/B/C/D/E', value: 'A, B, C, D, E' },
]

export const createEmptyDraftQuestion = (index: number): DraftPdfQuestion => ({
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

/**
 * 소문항 패턴("문제 1-1", "1-2" 등)을 대문항("문제 1") 단위로 자동 그룹화
 */
export function buildQuestionGroups(questions: DraftPdfQuestion[]): QuestionGroup[] {
  const groups: QuestionGroup[] = []
  const majorMap = new Map<string, number>()

  questions.forEach((q, qIdx) => {
    const subMatch = (q.label || '').trim().match(/(\d+)\s*[-–]\s*(\d+)/)
    if (subMatch) {
      const majorNum = Number(subMatch[1])
      const gKey = `major-${majorNum}`
      const existingPos = majorMap.get(gKey)
      if (existingPos !== undefined) {
        groups[existingPos].indices.push(qIdx)
      } else {
        majorMap.set(gKey, groups.length)
        groups.push({
          key: gKey,
          title: `문제 ${majorNum}`,
          majorNum,
          isGrouped: true,
          indices: [qIdx],
        })
      }
    } else {
      groups.push({
        key: `single-${qIdx}`,
        title: q.label || `문제 ${qIdx + 1}`,
        majorNum: null,
        isGrouped: false,
        indices: [qIdx],
      })
    }
  })

  return groups
}
