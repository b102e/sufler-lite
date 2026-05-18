"use client";

type Props = {
  onStart?: () => void;
  className?: string;
};

export default function HeroScreen({ onStart, className = "" }: Props) {
  return (
    <div className={`min-h-screen bg-white flex flex-col items-center justify-center px-6 ${className}`}>
      <div className="w-full max-w-sm flex flex-col items-center">

        <h1 className="text-3xl font-bold tracking-tight text-gray-900 text-center">
          Звони в Италии даже с нулевым итальянским
        </h1>

        <p className="text-base text-gray-500 text-center mt-3 max-w-xs mx-auto">
          Суфлёр подскажет фразу —<br />ты просто читаешь вслух.
        </p>

        {/* HowItWorks компонент сюда */}

        <button
          type="button"
          onClick={onStart}
          className="w-full bg-gray-900 text-white rounded-2xl py-4 text-base font-medium mt-8"
        >
          Новый звонок →
        </button>

      </div>
    </div>
  );
}
