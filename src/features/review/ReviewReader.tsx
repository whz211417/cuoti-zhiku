import { useState } from 'react';

type ReviewReaderProps = {
  stem: string;
  ownAnswer?: string;
  standardAnswer?: string;
  explanation?: string;
};

export function ReviewReader({ explanation, ownAnswer, standardAnswer, stem }: ReviewReaderProps) {
  const [isAnswerVisible, setIsAnswerVisible] = useState(false);
  return (
    <article className="review-reader" aria-label="专注复习">
      <p className="eyebrow">专注复习</p>
      <h2>{stem || '请先补充题干'}</h2>
      {ownAnswer ? <section className="review-own-answer"><p>我的作答</p><div>{ownAnswer}</div></section> : null}
      {!isAnswerVisible ? (
        <button className="reveal-answer" onClick={() => setIsAnswerVisible(true)} type="button">显示答案</button>
      ) : (
        <div className="review-answer">
          <section><p>标准答案</p><div>{standardAnswer || '尚未补充标准答案'}</div></section>
          {explanation ? <section><p>解析</p><div>{explanation}</div></section> : null}
        </div>
      )}
    </article>
  );
}
