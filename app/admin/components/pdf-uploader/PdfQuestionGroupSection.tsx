'use client'

/**
 * @file app/admin/components/pdf-uploader/PdfQuestionGroupSection.tsx
 * @description 2단계: 대문항 공통 지문 PDF 제어 + 하위 소문항 해설·채점 설정 카드 섹션
 */

import React from 'react'
import {
  ClipboardList,
  Plus,
  Trash2,
  CheckCircle2,
  Loader2,
  UploadCloud,
  Scissors,
  X,
} from 'lucide-react'
import {
  DraftPdfQuestion,
  GRADE_SCALE_PRESETS,
  buildQuestionGroups,
} from './types'

interface PdfQuestionGroupSectionProps {
  questions: DraftPdfQuestion[]
  sharedPdfUrl: string
  uploadingKey: string | null
  slicingQuestionKey: string | null
  onAddQuestion: () => void
  onRemoveQuestion: (qIdx: number) => void
  onUpdateQuestion: (qIdx: number, patch: Partial<DraftPdfQuestion>) => void
  onUpdateGroupQuestions: (indices: number[], patch: Partial<DraftPdfQuestion>) => void
  onAddSubQuestion: (majorNum: number, groupIndices: number[]) => void
  onUploadQuestionPdf: (
    qIdx: number,
    kind: 'question' | 'rubric',
    e: React.ChangeEvent<HTMLInputElement>
  ) => void
  onUploadGroupPdf: (
    groupKey: string,
    groupTitle: string,
    indices: number[],
    e: React.ChangeEvent<HTMLInputElement>
  ) => void
  onSliceTargetPdf: (targetKey: string, targetTitle: string, indices: number[]) => void
}

export default function PdfQuestionGroupSection({
  questions,
  sharedPdfUrl,
  uploadingKey,
  slicingQuestionKey,
  onAddQuestion,
  onRemoveQuestion,
  onUpdateQuestion,
  onUpdateGroupQuestions,
  onAddSubQuestion,
  onUploadQuestionPdf,
  onUploadGroupPdf,
  onSliceTargetPdf,
}: PdfQuestionGroupSectionProps) {
  const groups = buildQuestionGroups(questions)

  // 공통 문제지 PDF 설정 박스 렌더러 (대문항 그룹 헤더 또는 단일 문항 카드에서 공용 사용)
  const renderPdfControlBox = (
    targetKey: string,
    targetTitle: string,
    indices: number[],
    isGroupLevel: boolean
  ) => {
    const leader = questions[indices[0]]
    if (!leader) return null
    const uploadKey = isGroupLevel ? `group-pdf-${targetKey}` : `question-${indices[0]}`
    const isUploadingThis = uploadingKey === uploadKey
    const isSlicingThis = slicingQuestionKey === targetKey

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 12px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <strong style={{ fontSize: '12.5px', color: '#1e3a8a', display: 'block' }}>
              📄 {targetTitle}{' '}
              {isGroupLevel
                ? '공통 문제지 PDF (하위 소문항 전체 자동 연동)'
                : '개별 문제지 PDF (미첨부 시 상단 통합 PDF 사용)'}
            </strong>
            <span style={{ fontSize: '11.5px', color: '#475569' }}>
              {leader.questionPdfUrl ? (
                <span style={{ color: '#15803d', fontWeight: 700 }}>
                  <CheckCircle2 size={12} style={{ display: 'inline', marginRight: '4px' }} />
                  {leader.questionPdfName}
                </span>
              ) : sharedPdfUrl ? (
                `통합 PDF 사용 중 → 시작 페이지: ${leader.questionPdfStartPage}p`
              ) : (
                '개별 문제지 PDF를 업로드하거나 상단에 통합 PDF를 등록해 주세요.'
              )}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#334155' }}>시작 페이지:</span>
              <input
                type="number"
                min={1}
                value={leader.questionPdfStartPage}
                onChange={(e) =>
                  onUpdateGroupQuestions(indices, {
                    questionPdfStartPage: Math.max(1, Number(e.target.value) || 1),
                  })
                }
                style={{ width: '56px', padding: '4px 6px', borderRadius: '6px', border: '1px solid #93c5fd', fontSize: '12px', textAlign: 'center', background: '#fff' }}
              />
            </div>
            {leader.questionPdfUrl && sharedPdfUrl && (
              <button
                type="button"
                onClick={() => onUpdateGroupQuestions(indices, { questionPdfUrl: '', questionPdfName: '' })}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  padding: '5px 8px',
                  borderRadius: '6px',
                  background: '#ffffff',
                  color: '#dc2626',
                  border: '1px solid #fecaca',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
                title="개별 PDF를 해제하고 상단 통합 PDF로 되돌립니다"
              >
                <X size={11} />
                개별 해제
              </button>
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
                cursor: isUploadingThis ? 'wait' : 'pointer',
              }}
            >
              <input
                type="file"
                accept=".pdf,application/pdf"
                style={{ display: 'none' }}
                disabled={isUploadingThis}
                onChange={(e) =>
                  isGroupLevel
                    ? onUploadGroupPdf(targetKey, targetTitle, indices, e)
                    : onUploadQuestionPdf(indices[0], 'question', e)
                }
              />
              {isUploadingThis ? <Loader2 size={12} className="animate-spin" /> : <UploadCloud size={12} />}
              {leader.questionPdfUrl ? '개별 PDF 교체' : '개별 PDF 첨부'}
            </label>
          </div>
        </div>

        {/* 상단 통합 PDF에서 이 문항(그룹)만 원하는 페이지 범위로 직접 잘라내기 */}
        {sharedPdfUrl && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px',
              paddingTop: '8px',
              borderTop: '1px dashed #bfdbfe',
            }}
          >
            <span style={{ fontSize: '11.5px', color: '#1e40af', fontWeight: 600 }}>
              ✂️ 상단 통합 PDF에서 {targetTitle}만 특정 페이지 범위로 분리:
            </span>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="number"
                min={1}
                value={leader.sliceFromPage ?? leader.questionPdfStartPage}
                onChange={(e) =>
                  onUpdateGroupQuestions(indices, {
                    sliceFromPage: Math.max(1, Number(e.target.value) || 1),
                  })
                }
                style={{ width: '50px', padding: '3px 5px', borderRadius: '6px', border: '1px solid #93c5fd', fontSize: '12px', textAlign: 'center', background: '#fff' }}
              />
              <span style={{ fontSize: '11.5px', color: '#475569' }}>p ~</span>
              <input
                type="number"
                min={1}
                value={leader.sliceToPage ?? leader.questionPdfStartPage}
                onChange={(e) =>
                  onUpdateGroupQuestions(indices, {
                    sliceToPage: Math.max(1, Number(e.target.value) || 1),
                  })
                }
                style={{ width: '50px', padding: '3px 5px', borderRadius: '6px', border: '1px solid #93c5fd', fontSize: '12px', textAlign: 'center', background: '#fff' }}
              />
              <span style={{ fontSize: '11.5px', color: '#475569' }}>p</span>
              <button
                type="button"
                disabled={isSlicingThis}
                onClick={() => onSliceTargetPdf(targetKey, targetTitle, indices)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid #60a5fa',
                  background: '#2563eb',
                  color: '#ffffff',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: isSlicingThis ? 'wait' : 'pointer',
                }}
              >
                {isSlicingThis ? <Loader2 size={11} className="animate-spin" /> : <Scissors size={11} />}
                {isSlicingThis ? '분리 중...' : '이 문항만 분리'}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // 개별 문항(또는 소문항)의 채점·해설 카드 렌더러
  const renderQuestionCard = (qIdx: number, parentGroupTitle?: string) => {
    const q = questions[qIdx]
    if (!q) return null

    return (
      <div
        key={qIdx}
        className="admin-card"
        style={{
          border: '1px solid #cbd5e1',
          borderLeft: parentGroupTitle ? '4px solid #3b82f6' : '1px solid #cbd5e1',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          background: '#ffffff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '14.5px', fontWeight: 800, color: '#1e3a8a' }}>
              {q.label || `문제 ${qIdx + 1}`} {parentGroupTitle ? '해설 · 채점 설정' : '설정'}
            </span>
            {parentGroupTitle && (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#15803d',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                }}
              >
                ✓ {parentGroupTitle} 공통 PDF 연동됨
              </span>
            )}
          </div>
          {questions.length > 1 && (
            <button
              type="button"
              onClick={() => onRemoveQuestion(qIdx)}
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
              onChange={(e) => onUpdateQuestion(qIdx, { label: e.target.value })}
              placeholder="예: 문제 1-1, 문제 1"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>규정 글자 수</label>
            <input
              className="admin-input"
              value={q.limit}
              onChange={(e) => onUpdateQuestion(qIdx, { limit: e.target.value })}
              placeholder="예: 400±40자"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>대학 고유 채점 방식</label>
            <select
              className="admin-input"
              value={q.scoringType}
              onChange={(e) => onUpdateQuestion(qIdx, { scoringType: e.target.value as 'score' | 'grade' | 'both' })}
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
              onChange={(e) => onUpdateQuestion(qIdx, { maxScore: Number(e.target.value) || 100 })}
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
                    onClick={() => onUpdateQuestion(qIdx, { gradeScaleText: p.value })}
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
              onChange={(e) => onUpdateQuestion(qIdx, { gradeScaleText: e.target.value })}
              placeholder="예: A+, A, B+, B, C, D, F"
            />
          </div>
        )}

        {/* 단일 문항(소문항 그룹 아님)인 경우에만 카드 내부에 PDF 설정 박스 표시 */}
        {!parentGroupTitle && renderPdfControlBox(`single-${qIdx}`, q.label || `문제 ${qIdx + 1}`, [qIdx], false)}

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
                onChange={(e) => onUploadQuestionPdf(qIdx, 'rubric', e)}
              />
              {uploadingKey === `rubric-${qIdx}` ? <Loader2 size={12} className="animate-spin" /> : <UploadCloud size={12} />}
              {q.rubricPdfUrl ? `채점기준 PDF 첨부됨 (${q.rubricPdfName})` : '+ 채점기준·해설 PDF 첨부'}
            </label>
          </div>
          <textarea
            rows={4}
            className="admin-input"
            value={q.rawRubricText}
            onChange={(e) => onUpdateQuestion(qIdx, { rawRubricText: e.target.value })}
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
            onChange={(e) => onUpdateQuestion(qIdx, { modelAnswer: e.target.value })}
            placeholder="예시답안 모달 및 AI 1:1 첨삭(Rewrite) 참고용으로 공식 예시답안을 붙여넣으세요."
            style={{ fontSize: '12.5px', lineHeight: 1.55, resize: 'vertical' }}
          />
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ClipboardList size={16} color="#2563eb" />
          2단계. 문항별 문제지 PDF 및 대학 고유 채점기준 ({questions.length}문항)
        </h4>
        <button
          type="button"
          onClick={onAddQuestion}
          className="admin-btn-secondary"
          style={{ fontSize: '12.5px', fontWeight: 700 }}
        >
          <Plus size={14} /> 문항 추가
        </button>
      </div>

      {groups.map((group) => {
        if (!group.isGrouped) {
          return renderQuestionCard(group.indices[0])
        }

        // 대문항 공통 지문 그룹 카드 (예: 문제 1 → 공통 PDF 설정 + 하위 소문항 1-1, 1-2)
        return (
          <div
            key={group.key}
            style={{
              border: '2px solid #93c5fd',
              borderRadius: '14px',
              background: '#f8fafc',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '16px', fontWeight: 900, color: '#1e3a8a' }}>
                  📁 {group.title} (공통 지문)
                </span>
                <span
                  style={{
                    fontSize: '11.5px',
                    fontWeight: 700,
                    color: '#1d4ed8',
                    background: '#dbeafe',
                    padding: '2px 9px',
                    borderRadius: '9999px',
                  }}
                >
                  하위 {group.indices.length}개 소문항: {group.indices.map((i) => questions[i]?.label).join(' · ')}
                </span>
              </div>
              {group.majorNum !== null && (
                <button
                  type="button"
                  onClick={() => onAddSubQuestion(group.majorNum!, group.indices)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '5px 10px',
                    borderRadius: '7px',
                    border: '1px solid #93c5fd',
                    background: '#ffffff',
                    color: '#1d4ed8',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={12} /> {group.title} 소문항 추가
                </button>
              )}
            </div>

            {/* 대문항 공통 문제지 PDF 설정 (1회 설정으로 하위 소문항 전체 자동 동기화) */}
            {renderPdfControlBox(group.key, group.title, group.indices, true)}

            {/* 하위 소문항별 해설 및 채점 설정 카드 목록 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingLeft: '6px' }}>
              {group.indices.map((qIdx) => renderQuestionCard(qIdx, group.title))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
