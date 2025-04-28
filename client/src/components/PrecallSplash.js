import React, { useState, useEffect } from "react";

export default function PrecallSplash({ onReady }) {
  const steps = [
    { label: "Initialisation du canal sécurisé...", duration: 1200 },
    { label: "Authentification SSL/TLS...", duration: 1200 },
    { label: "Chiffrement end-to-end en cours...", duration: 1200 },
    { label: "Synchronisation des clés...", duration: 1200 },
    { label: "Accès autorisé !", duration: 1000 },
  ];
  const [phase, setPhase] = useState("invite");
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    let timer;
    if (phase === "loading" && stepIndex < steps.length) {
      timer = setTimeout(
        () => setStepIndex((idx) => idx + 1),
        steps[stepIndex].duration
      );
    } else if (phase === "loading") {
      timer = setTimeout(onReady, 500);
    }
    return () => clearTimeout(timer);
  }, [phase, stepIndex, onReady]);

  return (
    <div className="splash-backdrop">
      <div className="splash-card">
        {phase === "invite" ? (
          <>
            <h2 className="splash-title">
              🔒 Vous avez été invité·e à rejoindre une
              <br />
              session de communication sécurisée
            </h2>
            <button
              className="join-btn"
              onClick={() => {
                setPhase("loading");
                setStepIndex(0);
              }}
            >
              Rejoindre
            </button>
          </>
        ) : (
          <>
            <p className="splash-step">{steps[stepIndex]?.label}</p>
            <div className="splash-loader">
              <div
                className="bar"
                style={{
                  width: `${((stepIndex + 1) / steps.length) * 100}%`,
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
