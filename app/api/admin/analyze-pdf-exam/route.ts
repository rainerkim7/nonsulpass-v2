/**
 * @file app/api/admin/analyze-pdf-exam/route.ts
 * @description PDF 원문 간편 등록용 멀티모달 AI 자동 분석 API
 *              - 업로드된 통합 문제지/보고서 PDF를 Gemini 멀티모달로 직접 판독하여
 *                시험 기본 정보 + 문항별 배점/등급표/시작페이지 + 공식 채점기준 원문 + 예시답안을 자동 분류·추출합니다.
 *              - 제시문 본문은 PDF 뷰어로 원문 그대로 제공하므로 추출을 생략하여 토큰 비용과 출력 잘림을 최소화합니다.
 */

import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { callUnifiedAi } from '@/lib/ai-gateway'

export const dynamic = 'force-dynamic'

/**
 * Supabase Storage URL 또는 로컬 public/ 경로의 PDF를 base64로 로드
 */
async function loadPdfAsBase64(pdfUrl: string): Promise<string | null> {
  if (!pdfUrl || typeof pdfUrl !== 'string') return null
  const cleanUrl = pdfUrl.split('#')[0].trim()
  if (!cleanUrl) return null

  if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
    const res = await fetch(cleanUrl)
    if (!res.ok) {
      throw new Error(`PDF 다운로드 실패 (HTTP ${res.status})`)
    }
    const buf = Buffer.from(await res.arrayBuffer())
    return buf.toString('base64')
  }

  if (cleanUrl.startsWith('/')) {
    const localPath = path.normalize(path.join(process.cwd(), 'public', decodeURIComponent(cleanUrl)))
    if (fs.existsSync(localPath)) {
      return fs.readFileSync(localPath).toString('base64')
    }
  }

  return null
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const {
      pdfUrl = '',
      univId = '',
      univName = '',
      targetFaculty = '',
      customInstruction = '',
      model = 'gemini-3.1-pro-preview',
      includeQuestions = true,
      includeTrends = false,
      includeScoring = false,
    } = body

    if (!includeQuestions && !includeTrends && !includeScoring) {
      return NextResponse.json(
        { success: false, error: '최소 1개 이상의 추출 대상(문항 / 출제 경향 / 채점 기준)을 선택해 주세요.' },
        { status: 400 }
      )
    }

    if (!pdfUrl) {
      return NextResponse.json(
        { success: false, error: '분석할 PDF URL이 없습니다. 먼저 통합 문제지 PDF를 업로드해 주세요.' },
        { status: 400 }
      )
    }

    const pdfBase64 = await loadPdfAsBase64(pdfUrl)
    if (!pdfBase64) {
      return NextResponse.json(
        { success: false, error: '업로드된 PDF 파일을 읽을 수 없습니다.' },
        { status: 400 }
      )
    }

    const cleanInstruction = typeof customInstruction === 'string' ? customInstruction.trim() : ''
    const instructionBlock = cleanInstruction
      ? `\n[🚨 관리자 최우선 특별 지시사항]:\n${cleanInstruction}\n※ 반드시 위 지시사항에 해당하는 문항 세트만 추출하고, 제외하도록 지시된 계열·회차·문항은 절대 포함하지 마십시오.\n`
      : ''

    const extraRules: string[] = []
    if (includeTrends) {
      extraRules.push(`7. **대학 페이지 '출제 경향 및 유형 분석' (tab2_trends) 생성**:
   - 이 PDF의 실제 문항 구조를 바탕으로 대학 상세 페이지의 '출제 경향 및 유형 분석' 탭에 표시할 유형별 분석 배열(2~3개)을 생성하십시오.
   - 각 항목: questionNumber(예: "문제 1 유형"), questionType(핵심 유형명), examTime(예: "총 100분"), scoreWeight(예: "배점 50점"), questionTemplate(전형적 발문 공식), passageStructure({ base: "기준 제시문 역할", targets: "적용 대상 제시문 역할" }), description(출제 의도 및 접근법 2~3문장), writingFormula([{ step: "1단계", title: "서론", desc: "...", charGuide: "약 100자" }, ...]), frequentThemes(["키워드1", "키워드2", ...]).`)
    }
    if (includeScoring) {
      extraRules.push(`8. **대학 페이지 '채점 기준 및 배점 체계' (tab3_scoring) 생성**:
   - 이 PDF의 공식 배점표·등급 기준·감점 규정을 바탕으로 대학 상세 페이지의 '채점 기준 및 배점 체계' 탭 데이터를 생성하십시오.
   - scoringRules: 문항/계열별 배점 카드 2~4개 배열 ({ faculty: "계열·문항명", chip: "핵심 평가유형", score: "원배점/등급 기준", subDesc: "평가 방향 1~2문장" })
   - rubrics: 내용 평가 및 분량/형식 감점 세부 루브릭 3~5개 배열 ({ category: "평가 항목명", ratio: "배점 또는 감점폭", desc: "핵심 기준 설명", details: ["세부 요건 1", "세부 요건 2"] })`)
    }
    const extraRulesBlock = extraRules.length > 0 ? `\n${extraRules.join('\n')}` : ''

    const extraJsonFields = `${
      includeTrends
        ? `,
  "tab2_trends": [
    {
      "questionNumber": "문제 1 유형",
      "questionType": "요약·비교 및 적용형",
      "examTime": "총 100분",
      "scoreWeight": "배점 50점",
      "questionTemplate": "제시문 (가)의 관점에서 (나), (다)를 비교·평가하시오.",
      "passageStructure": { "base": "이론적 기준 제시문", "targets": "비교·적용 대상 제시문" },
      "description": "핵심 출제 의도 및 접근 전략 요약",
      "writingFormula": [
        { "step": "1단계", "title": "핵심 쟁점 요약", "desc": "기준 제시문의 핵심 개념 정리", "charGuide": "약 150자" },
        { "step": "2단계", "title": "비교 및 논증", "desc": "대상 제시문과의 공통점·차이점 대조", "charGuide": "약 450자" },
        { "step": "3단계", "title": "종합 결론", "desc": "발문 요구사항에 대한 완결적 결론", "charGuide": "약 200자" }
      ],
      "frequentThemes": ["핵심개념1", "핵심개념2", "핵심개념3"]
    }
  ]`
        : ''
    }${
      includeScoring
        ? `,
  "tab3_scoring": {
    "scoringRules": [
      { "faculty": "인문계열 문제 1", "chip": "비교·분석", "score": "50점 만점 (A+~F)", "subDesc": "제시문 독해력 및 논리적 비교 능력 평가" }
    ],
    "rubrics": [
      { "category": "제시문 이해 및 분석력", "ratio": "40% 내외", "desc": "핵심 논지 파악 및 정확한 개념 적용 여부", "details": ["제시문 핵심 논지 누락 여부", "단순 문장 복사(베껴쓰기) 시 감점"] }
    ]
  }`
        : ''
    }`

    const systemPrompt = includeQuestions
      ? `당신은 대한민국 대입 논술 입학처 보고서 및 문제지 분석 전문가입니다.
첨부된 PDF 문서를 정밀하게 판독하여, 논술패스 "PDF 원문 간편 등록" 입력폼을 채우기 위한 순수 JSON 데이터만 반환하십시오.

【핵심 원칙】
1. **제시문 본문 추출 금지**: 문제지와 제시문은 PDF 원문 뷰어로 학생에게 그대로 제공되므로, 제시문 전문을 JSON에 적지 마십시오.
2. **목표 계열 / 지시사항 정확 선별**: PDF 안에 여러 계열·회차(예: 인문 T1, 사회 T2, 인문 T3, 자연 T4 등)가 함께 들어있는 경우, 반드시 요청된 목표 계열("${targetFaculty}") 및 관리자 특별 지시사항에 해당하는 **단일 시험 세트(보통 2~3문항)**만 선별하여 추출하십시오.
3. **대학 고유 배점·등급 체계 원형 보존**:
   - 억지로 100점으로 환산하지 말고 PDF에 기재된 실제 문항 원만점(예: 280, 320, 400, 30, 40, 50, 100 등)과 실제 등급 체계(예: ["A+", "A0", "A-", "B+", "B0", "B-", "C", "D", "F"] 또는 ["S", "A", "B", "C", "D"])를 그대로 추출하십시오.
   - 등급표와 배점이 함께 있으면 scoringType을 "both", 등급표만 있으면 "grade", 점수만 있으면 "score"로 지정하십시오.
4. **문항 및 제시문 페이지 범위 정확 기입**:
   - 첨부된 PDF 파일의 **물리적 페이지 번호(1부터 시작하는 실제 PDF 페이지 인덱스, 문서 하단 인쇄 쪽번호 아님)** 기준으로,
   - 해당 시험 세트의 "2. 문항 및 제시문" 영역 전체가 시작하는 페이지(problemSectionStartPage)와 끝나는 페이지(problemSectionEndPage)를 정확히 기입하십시오. (출제 의도·출제 근거·문항 해설·채점 기준·예시 답안 페이지는 반드시 제외!)
   - 또한 각 문항의 시작 페이지(questionPdfStartPage)도 기입하십시오.
5. **원문 문항 번호 체계 원형 보존**:
   - PDF 원문에 소문항(예: 문항카드 1의 1-1, 1-2 / 문항카드 2의 2-1, 2-2 / 문항카드 3의 3-1, 3-2)이 있는 경우, 임의로 "문제 1, 문제 2, 문제 3, 문제 4..."로 일련번호를 바꾸지 말고 반드시 원문 소문항 번호를 보존하여 "문제 1-1", "문제 1-2", "문제 2-1", "문제 2-2", "문제 3-1", "문제 3-2" 형식으로 label에 기입하십시오.
   - 소문항 없이 단일 대문항만 있는 시험(예: 문제 1, 문제 2, 문제 3)은 기존처럼 "문제 1", "문제 2", "문제 3"으로 기입하십시오.
6. **채점 기준 및 예시답안 원문 보존**:
   - 각 문항의 rawRubricText에는 해당 문항의 [출제 의도], [문항 해설], [채점 요소], [등급별 세부 채점기준표]를 빠짐없이 원문 그대로 정리해 담으십시오.
   - 각 문항의 modelAnswer에는 해당 문항의 공식 예시답안 전문을 한 문장도 요약·생략하지 말고 원문 그대로 복원하십시오. (PDF에 예시답안이 없으면 빈 문자열 "")${extraRulesBlock}

【출력 JSON 형식】(마크다운 코드블록 없이 순수 JSON만 출력):
{
  "year": "2026학년도",
  "type": "기출문제",
  "title": "공식 시험명 (예: 2026학년도 한국외국어대학교 수시 논술고사 인문계 T1)",
  "totalTime": 90,
  "summary": "핵심 출제 주제 요약 1문장",
  "problemSectionStartPage": 1,
  "problemSectionEndPage": 6,
  "questions": [
    {
      "label": "소문항이 있으면 '문제 1-1', '문제 1-2', '문제 2-1' 등 원문 번호 보존 / 단일 문항이면 '문제 1'",
      "limit": "400자 내외",
      "scoringType": "both",
      "maxScore": 280,
      "gradeScale": ["A+", "A0", "A-", "B+", "B0", "B-", "C", "D", "F"],
      "questionPdfStartPage": 1,
      "rawRubricText": "[출제 의도 및 채점요소]\\n...\\n\\n[등급별 세부 채점기준]\\nA+: ...\\nA0: ...\\n...",
      "modelAnswer": "공식 예시답안 원문 전체..."
    }
  ]${extraJsonFields}
}`
      : `당신은 대한민국 대입 논술 입학처 보고서 및 문제지 분석 전문가입니다.
첨부된 PDF 문서를 정밀하게 판독하여, 요청된 대학("${univName || univId}")의 목표 계열("${targetFaculty}")에 해당하는 대학 상세 페이지 분석 데이터만 순수 JSON으로 반환하십시오.
※ 개별 문항(questions)은 이미 등록되어 있으므로 추출하지 마십시오.${extraRulesBlock}

【출력 JSON 형식】(마크다운 코드블록 없이 순수 JSON만 출력):
{${extraJsonFields.replace(/^,\s*/, '\n  ')}
}`

    const userPrompt = `[대상 대학]: ${univName || univId}
[선택된 목표 계열]: ${targetFaculty || '인문계열'}${instructionBlock}

첨부된 PDF를 판독하여 위 JSON 형식에 맞춰 요청된 모든 항목을 정확히 추출해 주세요.`

    const { text: rawText, modelUsed } = await callUnifiedAi({
      model: typeof model === 'string' && model.trim() ? model.trim() : 'gemini-3.1-pro-preview',
      systemPrompt,
      userPrompt,
      temperature: 0.1,
      maxOutputTokens: includeTrends || includeScoring ? 65536 : 32768,
      jsonMode: true,
      signal: req.signal,
      inlineAttachments: [{ mimeType: 'application/pdf', data: pdfBase64 }],
    })

    let cleanJson = rawText.trim()
    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.replace(/^```json\n?/, '').replace(/\n?```$/, '')
    } else if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```\n?/, '').replace(/\n?```$/, '')
    }

    const parsed = JSON.parse(cleanJson)

    return NextResponse.json({
      success: true,
      data: parsed,
      modelUsed,
    })
  } catch (error: any) {
    if (req.signal?.aborted || error?.name === 'AbortError') {
      return NextResponse.json({ success: false, error: '분석이 중단되었습니다.' }, { status: 499 })
    }
    console.error('[analyze-pdf-exam API Error]:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'PDF AI 자동 분석 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
