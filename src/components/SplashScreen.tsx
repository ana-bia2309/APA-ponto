import { useState, useEffect } from "react";

const SplashScreen = ({ onFinish }: { onFinish: () => void }) => {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setFadeOut(true), 2500);
    const end = setTimeout(() => onFinish(), 3000);
    return () => {
      clearTimeout(timer);
      clearTimeout(end);
    };
  }, [onFinish]);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center transition-opacity duration-500 ${
        fadeOut ? "opacity-0" : "opacity-100"
      }`}
      style={{ background: "linear-gradient(180deg, hsl(220 25% 8%) 0%, hsl(220 30% 14%) 100%)" }}
    >
      <p className="text-6xl font-bold text-white animate-scale-in">APA</p>
      <p className="mt-4 text-lg font-semibold tracking-widest text-white/90 animate-fade-in">
        Refrigeração e Climatização
      </p>
    </div>
  );
};

export default SplashScreen;
