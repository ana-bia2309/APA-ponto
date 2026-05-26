import { useState, useEffect } from "react";
import logo from "@/assets/logo-APA.png";

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
      <img src={logo} alt="APA Refrigeração e Climatização" className="w-56 h-56 object-contain animate-scale-in" style={{ filter: "drop-shadow(0 4px 24px rgba(100, 200, 255, 0.35))" }} />
    </div>
  );
};

export default SplashScreen;