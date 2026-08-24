import { BookOpenCheck, Eye, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type ReviewReaderProps = {
  stem: string;
  ownAnswer?: string;
  position?: number;
  standardAnswer?: string;
  total?: number;
  explanation?: string;
  gradeError?: string | null;
  isGrading?: boolean;
  onGrade?: (grade: 'forgot' | 'hard' | 'familiar' | 'mastered') => void;
  onRetry?: () => void;
};

const keyboardGrades = {
  1: 'forgot',
  2: 'hard',
  3: 'familiar',
  4: 'mastered',
} as const;

function getKeyboardGrade(key: string) {
  return key === '1' || key === '2' || key === '3' || key === '4' ? keyboardGrades[key] : undefined;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

export function ReviewReader({
  explanation,
  gradeError,
  isGrading = false,
  onGrade,
  onRetry,
  ownAnswer,
  position,
  standardAnswer,
  stem,
  total,
}: ReviewReaderProps) {
  const [isAnswerVisible, setIsAnswerVisible] = useState(false);
  const isAnswerVisibleRef = useRef(isAnswerVisible);
  const isGradingRef = useRef(isGrading);
  const onGradeRef = useRef(onGrade);
  const hasProgress = Boolean(total && total > 0 && position && position > 0);

  isAnswerVisibleRef.current = isAnswerVisible;
  isGradingRef.current = isGrading;
  onGradeRef.current = onGrade;

  useEffect(() => {
    setIsAnswerVisible(false);
  }, [stem, standardAnswer, explanation, ownAnswer]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || isEditableTarget(event.target)) return;
      if (event.code === 'Space' && !isAnswerVisibleRef.current) {
        event.preventDefault();
        setIsAnswerVisible(true);
        return;
      }
      const grade = getKeyboardGrade(event.key);
      if (grade && isAnswerVisibleRef.current && !isGradingRef.current && onGradeRef.current) {
        event.preventDefault();
        onGradeRef.current(grade);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <article className="review-reader" aria-label="专注复习">
      <header className="review-masthead">
        <div className="review-mode"><BookOpenCheck aria-hidden="true" size={15} /><span>专注复习</span></div>
        {hasProgress ? (
          <div className="review-session-progress">
            <span>第 {position} / {total} 道</span>
            <span aria-label="复习进度" aria-valuemax={total} aria-valuemin={1} aria-valuenow={position} className="review-progress-track" role="progressbar">
              <span style={{ width: `${Math.min(100, (position! / total!) * 100)}%` }} />
            </span>
          </div>
        ) : <p>先独立回忆，再展开对照</p>}
      </header>
      <div className="review-question">
        <p className="eyebrow">题目</p>
        <h2>{stem || '请先补充题干'}</h2>
      </div>
      {ownAnswer ? <section className="review-own-answer"><p>我的作答</p><div>{ownAnswer}</div></section> : null}
      {!isAnswerVisible ? (
        <div className="review-reveal-action">
          <button aria-label="显示答案" className="reveal-answer" onClick={() => setIsAnswerVisible(true)} type="button"><Eye aria-hidden="true" size={16} />显示答案与解析</button>
          <p className="review-shortcuts"><kbd>Space</kbd> 显示答案</p>
        </div>
      ) : (
        <div className="review-answer">
          <div className="answer-reveal-heading"><Sparkles aria-hidden="true" size={14} /><span>现在开始对照与校正</span></div>
          <section><p>标准答案</p><div>{standardAnswer || '尚未补充标准答案'}</div></section>
          {explanation ? <section className="review-explanation"><p>解析</p><div>{explanation}</div></section> : null}
          {onGrade ? (
            <>
              <div aria-label="复习评分" aria-busy={isGrading} className="review-grades">
                <button disabled={isGrading} onClick={() => onGrade('forgot')} type="button">忘记</button>
                <button disabled={isGrading} onClick={() => onGrade('hard')} type="button">困难</button>
                <button disabled={isGrading} onClick={() => onGrade('familiar')} type="button">熟悉</button>
                <button disabled={isGrading} onClick={() => onGrade('mastered')} type="button">掌握</button>
              </div>
              <p className="review-shortcuts">快捷键：<kbd>1</kbd> 忘记 · <kbd>2</kbd> 困难 · <kbd>3</kbd> 熟悉 · <kbd>4</kbd> 掌握</p>
              {gradeError ? (
                <div className="review-grade-error" role="alert">
                  <span>{gradeError}</span>
                  {onRetry ? <button onClick={onRetry} type="button">重新保存评分</button> : null}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      )}
    </article>
  );
}
