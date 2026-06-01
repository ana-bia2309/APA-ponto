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
      style={{ background: "#F0F4F8" }}
    >
      <img
        src={logo}
        alt="APA Refrigeração e Climatização"
        className="w-48 h-48 object-contain animate-scale-in"
        style={{ filter: "drop-shadow(0 4px 24px rgba(30,64,175,0.3))" }}
      />
      <p className="mt-4 font-bold text-lg text-gray-800 tracking-tight">APA Refrigeração e Climatização</p>
      <p className="text-xs text-gray-400 tracking-wider mt-1">Sistema de Registro de Ponto</p>
      <div className="mt-8 w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
};

export default SplashScreen;