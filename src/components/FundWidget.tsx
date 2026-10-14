type Props = {
  title: string;
  amount: number;
  goal: number;
  goalLabel: string;
  hint: string;
  money: (n: number) => string;
  children?: React.ReactNode;
};

export function FundWidget({ title, amount, goal, goalLabel, hint, money, children }: Props) {
  const pct = goal > 0 ? Math.max(0, Math.min(100, Math.round((amount / goal) * 100))) : null;
  return (
    <article className="fund-widget">
      <h3>{title}</h3>
      <p className="fund-widget__amount">{money(amount)}</p>
      {pct !== null && (
        <>
          <p className="hint">
            {pct}% of {money(goal)} {goalLabel}
          </p>
          <div
            className="meter"
            role="progressbar"
            aria-label={title}
            aria-valuemin={0}
            aria-valuemax={goal}
            aria-valuenow={Math.max(0, amount)}
            aria-valuetext={`${money(amount)} of ${money(goal)}, ${pct}%`}
          >
            <span style={{ width: `${pct}%` }} />
          </div>
        </>
      )}
      {children}
      <p className="hint">{hint}</p>
    </article>
  );
}
