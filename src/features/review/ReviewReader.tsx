import { BookOpenCheck, Eye, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

type ReviewReaderProps = {
  stem: string;
  ownAnswer?: string;
  standardAnswer?: string;
  explanation?: string;
  gradeError?: string | null;
  isGrading?: boolean;
  onGrade?: (grade: 'forgot' | 'hard' | 'familiar' | 'mastered') => void;
  onRetry?: () => void;
};

export function ReviewReader({
  explanation,
  gradeError,
  isGrading = false,
  onGrade,
  onRetry,
  ownAnswer,
  standardAnswer,
  stem,
}: ReviewReaderProps) {
  const [isAnswerVisible, setIsAnswerVisible] = useState(false);

  useEffect(() => {
    setIsAnswerVisible(false);
  }, [stem, standardAnswer, explanation, ownAnswer]);

  return (
    <article className="review-reader" aria-label="专注复习">
      <header className="review-masthead">
        <div className="review-mode"><BookOpenCheck aria-hidden="true" size={15} /><span>专注复习</span></div>
        <p>先独立回忆，再展开对照</p>
      </header>
      <div className="review-question">
        <p className="eyebrow">题目</p>
        <h2>{stem || '请先补充题干'}</h2>
      </div>
      {ownAnswer ? <section className="review-own-answer"><p>我的作答</p><div>{ownAnswer}</div></section> : null}
      {!isAnswerVisible ? (
        <button aria-label="显示答案" className="reveal-answer" onClick={() => setIsAnswerVisible(true)} type="button"><Eye aria-hidden="true" size={16} />显示答案与解析</button>
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
