'use client'

/**
 * @file components/exam/ExamReferenceModals.tsx
 * @description 논술 응시 워크스페이스 내 참조 모달 및 채점 진행 오버레이 모음
 *              - ModelAnswerModal: 공식 모범답안 확인 및 답안지 불러오기 팝업
 *              - RubricModal: 대학 공식 채점 기준표 및 배점표 팝업
 *              - GradingLoadingOverlay: AI 채점 진행 단계 및 지연 안내 오버레이
 */

import React from 'react'
import { X, Copy, Sparkles } from 'lucide-react'
import type { QuestionData } from '@/lib/exam-helper'
import { renderFormattedParagraph } from './PassageContentRenderer'

interface ModelAnswerModalProps {
  isOpen: boolean
  onClose: () => void
  currentQ: QuestionData
  currentAnswer: string
  onApplyAnswer: (answer: string) => void
}

/**
 * 공식 모범답안 팝업 모달
 */
export function ModelAnswerModal({
  isOpen,
  onClose,
  currentQ,
  currentAnswer,
  onApplyAnswer,
}: ModelAnswerModalProps) {
  if (!isOpen) return null

  return (
    <div className="model-modal-overlay" onClick={onClose}>
      <div className="model-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="model-modal-header">
          <div className="model-modal-title">
            <span className="model-modal-pill">{currentQ.modalPill}</span>
            <h3>{currentQ.modalTitle}</h3>
            <p>{currentQ.modalLength}</p>
          </div>
          <button
            type="button"
            className="model-modal-close"
            onClick={onClose}
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>
        <div className="model-modal-body">
          <div className="model-modal-callout">{currentQ.modalCallout}</div>
          <div className="model-modal-text">
            {currentQ.modelAnswer
              .split('\n\n')
              .map((para, idx) => renderFormattedParagraph(para, `model-${idx}`))}
          </div>
        </div>
        <div className="model-modal-footer">
          <button
            type="button"
            className="model-footer-btn-copy"
            onClick={() => {
              navigator.clipboard.writeText(currentQ.modelAnswer)
              alert('모범답안이 클립보드에 복사되었습니다.')
            }}
          >
            <Copy size={13} /> 모범답안 복사
          </button>
          <button
            type="button"
            className="model-footer-btn-apply"
            onClick={() => {
              if (
                currentAnswer.trim() &&
                !confirm('작성 중인 답안이 모범답안으로 대체됩니다. 계속하시겠습니까?')
              ) {
                return
              }
              onApplyAnswer(currentQ.modelAnswer)
              onClose()
            }}
          >
            답안지에 불러오기
          </button>
          <button type="button" className="model-footer-btn-close" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}

interface RubricModalProps {
  isOpen: boolean
  onClose: () => void
  currentUniv: string
  currentQ: QuestionData
}

/**
 * 공식 채점 기준표 팝업 모달
 */
export function RubricModal({ isOpen, onClose, currentUniv, currentQ }: RubricModalProps) {
  if (!isOpen) return null

  return (
    <div className="model-modal-overlay" onClick={onClose}>
      <div className="rubric-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="model-modal-header">
          <div className="model-modal-title">
            <span className="model-modal-pill">
              {currentQ.modalPill || currentQ.label} 공식 채점표
            </span>
            <h3>
              {currentQ.tag || `${currentUniv} 논술`} {currentQ.label} 채점 기준표
            </h3>
            <p>{currentUniv} 입학처 공식 출제 문항카드 평가 기준 원문 반영</p>
          </div>
          <button
            type="button"
            className="model-modal-close"
            onClick={onClose}
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>
        <div className="rubric-modal-body">
          <div className="rubric-faculty-badge">
            ⚖️ <strong>단과대학별 가중 배점 안내:</strong> {currentQ.rubric.facultyWeight}
          </div>

          <div className="rubric-table-wrap">
            {/* 하이브리드 PDF/원문 채점기준이 등록된 경우 대학 공식 원문 그대로 표시 */}
            {(currentQ.rawRubricText || currentQ.rubricPdfUrl) ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', margin: '8px 0' }}>
                {currentQ.scoringSystem && (
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: '10px',
                      backgroundColor: '#eff6ff',
                      border: '1px solid #bfdbfe',
                      fontSize: '12.5px',
                      color: '#1e3a8a',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '12px',
                    }}
                  >
                    <span>
                      <strong>채점 체계:</strong>{' '}
                      {currentQ.scoringSystem.type === 'grade'
                        ? '대학 공식 등급제 (+ 100점 환산 참고점수)'
                        : currentQ.scoringSystem.type === 'both'
                        ? '대학 공식 등급 + 원배점 병기'
                        : '대학 공식 원배점 점수제'}
                    </span>
                    <span>
                      <strong>문항 원만점:</strong> {currentQ.scoringSystem.maxScore}점
                    </span>
                    {currentQ.scoringSystem.gradeScale && currentQ.scoringSystem.gradeScale.length > 0 && (
                      <span>
                        <strong>등급표:</strong> {currentQ.scoringSystem.gradeScale.join(' · ')}
                      </span>
                    )}
                  </div>
                )}

                {currentQ.rawRubricText && (
                  <div
                    style={{
                      padding: '16px 18px',
                      borderRadius: '10px',
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      fontSize: '13.5px',
                      lineHeight: 1.75,
                      color: '#1e293b',
                      whiteSpace: 'pre-wrap',
                      maxHeight: '360px',
                      overflowY: 'auto',
                    }}
                  >
                    {currentQ.rawRubricText}
                  </div>
                )}

                {currentQ.rubricPdfUrl && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>
                        📄 대학 공식 채점기준·해설 PDF ({currentQ.rubricPdfName || '공식 해설'})
                      </span>
                      <a
                        href={currentQ.rubricPdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#2563eb',
                          textDecoration: 'underline',
                        }}
                      >
                        새 창에서 크게 보기 ↗
                      </a>
                    </div>
                    <iframe
                      src={`${currentQ.rubricPdfUrl}#toolbar=0&navpanes=0&view=FitH`}
                      title="대학 공식 채점기준 PDF"
                      style={{
                        width: '100%',
                        height: '420px',
                        borderRadius: '10px',
                        border: '1px solid #cbd5e1',
                      }}
                    />
                  </div>
                )}
              </div>
            ) : !currentQ.rubric.items || currentQ.rubric.items.length === 0 ? (
              <div
                style={{
                  padding: '28px 20px',
                  textAlign: 'center',
                  background: '#f8fafc',
                  borderRadius: '12px',
                  border: '1px dashed #cbd5e1',
                  color: '#475569',
                  margin: '8px 0',
                }}
              >
                <p
                  style={{
                    fontWeight: 700,
                    fontSize: '15px',
                    marginBottom: '8px',
                    color: '#1e293b',
                  }}
                >
                  📋 문항별 세부 루브릭 준비 중
                </p>
                <p style={{ fontSize: '13.5px', margin: 0, lineHeight: 1.6 }}>
                  본 문항은 대학 공식{' '}
                  <strong>모범답안, 제시문 핵심 논점 및 규정 분량(±10%)</strong>을 기준으로 AI
                  채점관의 블라인드 정밀 채점과 1:1 맞춤 첨삭이 정상 진행됩니다.
                </p>
              </div>
            ) : (
              <table className="rubric-table">
                <thead>
                  <tr>
                    <th style={{ width: '24%' }}>평가 영역</th>
                    <th style={{ width: '20%' }}>평가 대상</th>
                    <th style={{ width: '44%' }}>세부 채점 기준 및 핵심 도출 내용</th>
                    <th style={{ width: '12%', textAlign: 'center' }}>배점</th>
                  </tr>
                </thead>
                <tbody>
                  {currentQ.rubric.items.map((sec, sIdx) =>
                    sec.subItems.map((sub, subIdx) => (
                      <tr key={`${sIdx}-${subIdx}`}>
                        {subIdx === 0 && (
                          <td rowSpan={sec.subItems.length} className="rubric-sec-title">
                            {sec.category}
                          </td>
                        )}
                        <td className="rubric-item-name">{sub.name}</td>
                        <td className="rubric-item-desc">{sub.desc}</td>
                        <td className="rubric-item-points">{sub.points}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>

          <div className="rubric-deduction-card">
            <h4>⚠️ 출제위원 감점 유의사항 (공통)</h4>
            <ul>
              {currentQ.rubric.deductions.map((d, dIdx) => (
                <li key={dIdx}>{d}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="model-modal-footer">
          <button type="button" className="model-footer-btn-close" onClick={onClose}>
            확인 및 닫기
          </button>
        </div>
      </div>
    </div>
  )
}

interface GradingLoadingOverlayProps {
  isGrading: boolean
  gradingStep: number
  onCancelGrading: () => void
}

/**
 * AI 채점 진행 오버레이 (사용자 사정 또는 지연 시 직접 중단할 수 있는 중단하기 버튼 상시 제공)
 */
export function GradingLoadingOverlay({
  isGrading,
  gradingStep,
  onCancelGrading,
}: GradingLoadingOverlayProps) {
  if (!isGrading) return null

  return (
    <div className="grading-loading-overlay">
      <div className="grading-loading-card">
        <div className="grading-spinner-wrap">
          <div className="grading-spinner-ring" />
          <Sparkles className="grading-spinner-icon" />
        </div>
        <h3 className="grading-loading-title">출제위원 AI가 정밀 채점 중입니다</h3>
        <p className="grading-loading-desc">
          공식 문항 채점 기준표 및 감점 방지 원칙에 입각하여 학생 답안을 꼼꼼하게 대조·평가하고 있습니다.
        </p>
        <div className="grading-steps-list">
          <div className={`grading-step-row ${gradingStep >= 1 ? 'active' : ''}`}>
            <span className="grading-step-dot" />
            <span>1단계: 발문 요구조건 부합도 및 제시문 독해 분석</span>
          </div>
          <div className={`grading-step-row ${gradingStep >= 2 ? 'active' : ''}`}>
            <span className="grading-step-dot" />
            <span>2단계: 대학 공식 채점 기준표 항목별 배점 산출</span>
          </div>
          <div className={`grading-step-row ${gradingStep >= 3 ? 'active' : ''}`}>
            <span className="grading-step-dot" />
            <span>3단계: 감점 요인 적발 및 1:1 합격자 수준 첨삭(Rewrite) 생성</span>
          </div>
        </div>

        {/* 필요 시 의도적으로만 클릭하도록 우측 하단에 작게 배치한 중단하기 버튼 */}
        <div style={{ marginTop: '18px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="grading-btn-cancel"
            onClick={onCancelGrading}
            style={{
              padding: '5px 11px',
              fontSize: '11.5px',
              fontWeight: 600,
              borderRadius: '6px',
              color: '#64748b',
              borderColor: '#e2e8f0',
            }}
          >
            중단하기
          </button>
        </div>
      </div>
    </div>
  )
}

