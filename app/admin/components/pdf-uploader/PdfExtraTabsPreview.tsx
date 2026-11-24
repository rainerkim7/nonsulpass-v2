'use client'

/**
 * @file app/admin/components/pdf-uploader/PdfExtraTabsPreview.tsx
 * @description 3단계: AI가 생성한 대학 페이지 '출제 경향' · '채점 기준 및 배점 체계' 미리보기, 간편 편집 및 단독 저장 패널
 */

import React from 'react'
import { Sparkles, Save, Loader2 } from 'lucide-react'
import type { ExtractedScoringData } from './types'

interface PdfExtraTabsPreviewProps {
  extractedTrends: any[]
  setExtractedTrends: React.Dispatch<React.SetStateAction<any[]>>
  extractedScoring: ExtractedScoringData | null
  setExtractedScoring: React.Dispatch<React.SetStateAction<ExtractedScoringData | null>>
  saveTrendsWithExam: boolean
  setSaveTrendsWithExam: (val: boolean) => void
  saveScoringWithExam: boolean
  setSaveScoringWithExam: (val: boolean) => void
  isSaving: boolean
  isSavingTabsOnly: boolean
  onSaveTabsOnly: () => void
}

export default function PdfExtraTabsPreview({
  extractedTrends,
  setExtractedTrends,
  extractedScoring,
  setExtractedScoring,
  saveTrendsWithExam,
  setSaveTrendsWithExam,
  saveScoringWithExam,
  setSaveScoringWithExam,
  isSaving,
  isSavingTabsOnly,
  onSaveTabsOnly,
}: PdfExtraTabsPreviewProps) {
  if (extractedTrends.length === 0 && !extractedScoring) {
    return null
  }

  return (
    <div
      className="admin-card"
      style={{
        border: '2px solid #86efac',
        background: 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%)',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#14532d', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Sparkles size={16} color="#16a34a" />
          3단계. 대학 상세 페이지 자동 채우기 미리보기 (출제 경향 · 채점 기준)
        </h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {extractedTrends.length > 0 && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 700, color: '#166534', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={saveTrendsWithExam}
                onChange={(e) => setSaveTrendsWithExam(e.target.checked)}
              />
              출제 경향 함께 저장 ({extractedTrends.length}건)
            </label>
          )}
          {extractedScoring && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 700, color: '#166534', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={saveScoringWithExam}
                onChange={(e) => setSaveScoringWithExam(e.target.checked)}
              />
              채점 기준 함께 저장 ({extractedScoring.scoringRules.length}규칙 / {extractedScoring.rubrics.length}루브릭)
            </label>
          )}
          <button
            type="button"
            onClick={onSaveTabsOnly}
            disabled={isSavingTabsOnly || isSaving}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 12px',
              borderRadius: '7px',
              border: '1px solid #16a34a',
              background: '#16a34a',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 700,
              cursor: isSavingTabsOnly ? 'wait' : 'pointer',
              opacity: isSavingTabsOnly ? 0.75 : 1,
            }}
            title="기존 기출시험(1·2단계)은 건드리지 않고 출제 경향·채점 기준 탭만 단독 저장합니다"
          >
            {isSavingTabsOnly ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {isSavingTabsOnly ? '저장 중...' : '💾 출제 경향 · 채점 기준만 바로 저장'}
          </button>
        </div>
      </div>

      {/* 출제 경향 미리보기 & 간편 편집 */}
      {extractedTrends.length > 0 && saveTrendsWithExam && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <strong style={{ fontSize: '13px', color: '#1e3a8a' }}>
            📊 출제 경향 및 유형 분석 ({extractedTrends.length}개 유형)
          </strong>
          {extractedTrends.map((t, tIdx) => (
            <div
              key={tIdx}
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 130px', gap: '8px' }}>
                <input
                  className="admin-input"
                  value={t.questionNumber || ''}
                  onChange={(e) =>
                    setExtractedTrends((prev) =>
                      prev.map((item, i) => (i === tIdx ? { ...item, questionNumber: e.target.value } : item))
                    )
                  }
                  placeholder="문항 유형명"
                  style={{ fontSize: '12px', fontWeight: 700 }}
                />
                <input
                  className="admin-input"
                  value={t.questionType || ''}
                  onChange={(e) =>
                    setExtractedTrends((prev) =>
                      prev.map((item, i) => (i === tIdx ? { ...item, questionType: e.target.value } : item))
                    )
                  }
                  placeholder="핵심 출제 유형"
                  style={{ fontSize: '12px' }}
                />
                <input
                  className="admin-input"
                  value={t.scoreWeight || ''}
                  onChange={(e) =>
                    setExtractedTrends((prev) =>
                      prev.map((item, i) => (i === tIdx ? { ...item, scoreWeight: e.target.value } : item))
                    )
                  }
                  placeholder="배점 비중"
                  style={{ fontSize: '12px' }}
                />
              </div>
              <textarea
                rows={2}
                className="admin-input"
                value={t.description || ''}
                onChange={(e) =>
                  setExtractedTrends((prev) =>
                    prev.map((item, i) => (i === tIdx ? { ...item, description: e.target.value } : item))
                  )
                }
                placeholder="출제 의도 및 접근 전략 요약"
                style={{ fontSize: '12px', resize: 'vertical' }}
              />
            </div>
          ))}
        </div>
      )}

      {/* 채점 기준 및 배점 체계 미리보기 & 간편 편집 */}
      {extractedScoring && saveScoringWithExam && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <strong style={{ fontSize: '13px', color: '#1e3a8a' }}>
            ⚖️ 채점 기준 및 배점 체계 ({extractedScoring.scoringRules.length}개 배점 카드 · {extractedScoring.rubrics.length}개 세부 루브릭)
          </strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '8px' }}>
            {extractedScoring.scoringRules.map((rule, rIdx) => (
              <div
                key={rIdx}
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '5px',
                }}
              >
                <input
                  className="admin-input"
                  value={rule.faculty || ''}
                  onChange={(e) =>
                    setExtractedScoring((prev) =>
                      prev
                        ? {
                            ...prev,
                            scoringRules: prev.scoringRules.map((r, i) =>
                              i === rIdx ? { ...r, faculty: e.target.value } : r
                            ),
                          }
                        : prev
                    )
                  }
                  style={{ fontSize: '12px', fontWeight: 700 }}
                />
                <input
                  className="admin-input"
                  value={rule.score || ''}
                  onChange={(e) =>
                    setExtractedScoring((prev) =>
                      prev
                        ? {
                            ...prev,
                            scoringRules: prev.scoringRules.map((r, i) =>
                              i === rIdx ? { ...r, score: e.target.value } : r
                            ),
                          }
                        : prev
                    )
                  }
                  style={{ fontSize: '12px', color: '#1d4ed8', fontWeight: 700 }}
                />
                <input
                  className="admin-input"
                  value={rule.subDesc || ''}
                  onChange={(e) =>
                    setExtractedScoring((prev) =>
                      prev
                        ? {
                            ...prev,
                            scoringRules: prev.scoringRules.map((r, i) =>
                              i === rIdx ? { ...r, subDesc: e.target.value } : r
                            ),
                          }
                        : prev
                    )
                  }
                  style={{ fontSize: '11.5px' }}
                />
              </div>
            ))}
          </div>
          {extractedScoring.rubrics.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {extractedScoring.rubrics.map((rb, rbIdx) => (
                <div
                  key={rbIdx}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    display: 'grid',
                    gridTemplateColumns: '170px 110px 1fr',
                    gap: '8px',
                    alignItems: 'center',
                  }}
                >
                  <input
                    className="admin-input"
                    value={rb.category || ''}
                    onChange={(e) =>
                      setExtractedScoring((prev) =>
                        prev
                          ? {
                              ...prev,
                              rubrics: prev.rubrics.map((r, i) =>
                                i === rbIdx ? { ...r, category: e.target.value } : r
                              ),
                            }
                          : prev
                      )
                    }
                    style={{ fontSize: '12px', fontWeight: 700 }}
                  />
                  <input
                    className="admin-input"
                    value={rb.ratio || ''}
                    onChange={(e) =>
                      setExtractedScoring((prev) =>
                        prev
                          ? {
                              ...prev,
                              rubrics: prev.rubrics.map((r, i) =>
                                i === rbIdx ? { ...r, ratio: e.target.value } : r
                              ),
                            }
                          : prev
                      )
                    }
                    style={{ fontSize: '12px', color: '#2563eb', fontWeight: 700 }}
                  />
                  <input
                    className="admin-input"
                    value={rb.desc || ''}
                    onChange={(e) =>
                      setExtractedScoring((prev) =>
                        prev
                          ? {
                              ...prev,
                              rubrics: prev.rubrics.map((r, i) =>
                                i === rbIdx ? { ...r, desc: e.target.value } : r
                              ),
                            }
                          : prev
                      )
                    }
                    style={{ fontSize: '12px' }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
