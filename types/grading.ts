// 논술 AI 정밀 채점 리포트 데이터 인터페이스 정의
export interface CriterionGrade {
  category: string        // 평가 영역 (예: '제시문 (가)~(라) 집중과 분산 양상 분석')
  score: number           // 획득 점수 (예: 52)
  maxScore: number        // 배점 (예: 60)
  feedback: string        // 구체적 평가 피드백
  warning?: string        // 감점 경고 (예: '양비론/절충론 감점 적용 (-10점)')
}

export interface DeductionItem {
  location: string        // 위치 (예: '논증 · 문단 2')
  originalSentence: string// 학생 원문 문장
  critique: string        // 감점 이유 및 문제점 분석
  penaltyScore: number    // 감점 점수 (음수 또는 양수 숫자, 예: -10)
}

export interface GradingReportData {
  examTitle: string       // 시험명 (예: '2026학년도 홍익대학교 인문계열 (서울 오전) 문제 1')
  questionLabel: string   // 문항 라벨 (예: '문제 1 (집중과 분산)')
  studentName?: string    // 학생명
  totalScore: number      // 총점 (대학 고유 원배점 기준 또는 100점 만점 기준)
  maxPossibleScore: number// 문항 원만점 (예: 30, 40, 50, 100)
  cutlineScore: number    // 예상 합격선 (예: 82 또는 원배점 기준 합격선)
  statusVerdict: string   // '합격 안정권' | '합격 가능권' | '도전 권장'
  // 대학 고유 채점 체계 지원 필드 (등급제 / 원배점 + 100점 환산 참고점수 병기)
  scoringType?: 'score' | 'grade' | 'both' // 점수제 | 등급제 | 등급+점수 병기
  officialGrade?: string  // 대학 공식 등급 (예: 'A+', 'A', 'S', '상')
  gradeRationale?: string // 공식 등급 판정 근거 1~2줄 요약
  normalizedScore100?: number // 대학 발표 합격선(100점 기준) 비교용 100점 환산 참고점수
  charCount: number       // 실제 작성 글자 수
  charStatus: string      // '통과 · 감점 0점' | '분량 미달 · 감점 적용'
  conceptHits: {
    matchedCount: number  // 적중 개념어 개수
    targetTotal: number   // 전체 핵심 개념어 개수
    keywords: string[]    // 적중된 개념어 목록
  }
  structureGrade: string  // 'A' | 'B+' | 'B' | 'C'
  criteria: CriterionGrade[]
  examinerVerdict: {
    oneLiner: string      // 출제위원의 한 줄 총평
    coreAdvice: string    // 핵심 과제 및 개선 가이드
  }
  deductions: DeductionItem[]
  rewrite: {
    beforeText: string    // 학생 원문 발췌
    flawReason: string    // 감점 사유
    afterText: string     // AI 합격자 수준 재작성 문장
  }
  modelUsed?: string      // 실제 채점을 수행한 AI 모델명 (예: gemini-3.1-pro-preview)
}
