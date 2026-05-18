"use client";

import { useState } from "react";
import { PrepData } from "./types";

const LIMITS = {
  name: 80,
  organization: 100,
  goal: 150,
  details: 400,
} as const;

const COUNTER_THRESHOLD = 0.8; // show counter when >80% used

type ReviewData = Pick<PrepData, "name" | "organization" | "goal" | "details">;

type Props = {
  prepData: PrepData;
  onSubmit: (data: ReviewData) => void;
};

export default function CallSummaryReview({ prepData, onSubmit }: Props) {
  const [name, setName] = useState(prepData.name.slice(0, LIMITS.name));
  const [organization, setOrganization] = useState(prepData.organization.slice(0, LIMITS.organization));
  const [goal, setGoal] = useState(prepData.goal.slice(0, LIMITS.goal));
  const [details, setDetails] = useState(prepData.details.slice(0, LIMITS.details));

  const isValid = name.trim() && organization.trim() && goal.trim();

  function handleSubmit() {
    if (!isValid) return;
    onSubmit({
      name: name.trim(),
      organization: organization.trim(),
      goal: goal.trim(),
      details: details.trim(),
    });
  }

  return (
    <div className="flex flex-col min-h-screen px-4 pt-12 pb-8 anim-page bg-cb-bg">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-widest text-cb-muted mb-3">Суфлер</p>
        <h1 className="text-2xl font-semibold text-cb-text">Проверка данных</h1>
        <p className="mt-2 text-sm text-cb-muted">Проверьте и при необходимости исправьте</p>
      </header>

      <div className="flex-1 space-y-5">
        <Field
          label="Имя"
          value={name}
          onChange={setName}
          placeholder="Как вас представить во время звонка"
          maxLength={LIMITS.name}
        />
        <Field
          label="Организация"
          value={organization}
          onChange={setOrganization}
          placeholder="Куда звоните"
          maxLength={LIMITS.organization}
        />
        <Field
          label="Цель звонка"
          value={goal}
          onChange={setGoal}
          placeholder="Что нужно решить или узнать"
          maxLength={LIMITS.goal}
        />
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <label className="text-xs font-medium text-cb-muted">
              Дополнительно
            </label>
            {details.length >= LIMITS.details * COUNTER_THRESHOLD && (
              <span className={`text-xs tabular-nums ${details.length >= LIMITS.details ? "text-cb-red" : "text-cb-muted"}`}>
                {LIMITS.details - details.length}
              </span>
            )}
          </div>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value.slice(0, LIMITS.details))}
            rows={4}
            maxLength={LIMITS.details}
            placeholder="Любые подробности, номера документов, другая информация"
            className="w-full rounded-xl border border-cb-dark-gray bg-cb-elevated px-4 py-3 text-sm text-cb-text placeholder:text-cb-muted focus:border-cb-emerald focus:outline-none resize-none transition-colors duration-200"
          />
        </div>
      </div>

      <div className="pt-6">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!isValid}
          className="w-full h-14 rounded-2xl bg-cb-emerald text-cb-bg text-base font-medium disabled:opacity-30 hover:bg-cb-emerald-hover active:scale-[0.98] transition-all duration-150"
        >
          Далее
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  maxLength: number;
}) {
  const nearLimit = value.length >= maxLength * COUNTER_THRESHOLD;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <label className="text-xs font-medium text-cb-muted">{label}</label>
        {nearLimit && (
          <span className={`text-xs tabular-nums ${value.length >= maxLength ? "text-cb-red" : "text-cb-muted"}`}>
            {maxLength - value.length}
          </span>
        )}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
        maxLength={maxLength}
        placeholder={placeholder}
        className="w-full rounded-xl border border-cb-dark-gray bg-cb-elevated px-4 py-3 text-sm text-cb-text placeholder:text-cb-muted focus:border-cb-emerald focus:outline-none transition-colors duration-200"
      />
    </div>
  );
}
