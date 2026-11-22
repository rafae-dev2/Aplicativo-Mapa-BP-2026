export default function Logo() {
  return (
    <div className="flex flex-col items-center justify-center gap-4">
      {/* Logo SVG animado */}
      <svg
        width="120"
        height="120"
        viewBox="0 0 120 120"
        className="rotating-logo"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Círculo externo vermelho */}
        <circle cx="60" cy="60" r="58" fill="#FF6B6B" />

        {/* Círculo amarelo */}
        <circle cx="60" cy="60" r="52" fill="#FFEB3B" />

        {/* Círculo branco interno */}
        <circle cx="60" cy="60" r="48" fill="white" />

        {/* Semicírculo verde superior */}
        <path
          d="M 60 12 A 48 48 0 0 1 60 108 A 24 24 0 0 1 60 60 A 24 24 0 0 0 60 12 Z"
          fill="#4CAF50"
        />

        {/* Semicírculo verde inferior (mais escuro) */}
        <path
          d="M 60 108 A 48 48 0 0 1 60 12 A 24 24 0 0 1 60 60 A 24 24 0 0 0 60 108 Z"
          fill="#2E7D32"
        />

        {/* Círculo amarelo central (ponto da bússola) */}
        <circle cx="60" cy="60" r="12" fill="#FFEB3B" />

        {/* Ponto branco no centro */}
        <circle cx="60" cy="60" r="6" fill="white" />

        {/* Linhas de orientação (N, S, E, O) */}
        <line x1="60" y1="20" x2="60" y2="30" stroke="#2E7D32" strokeWidth="2" />
        <line x1="60" y1="90" x2="60" y2="100" stroke="#2E7D32" strokeWidth="2" />
        <line x1="20" y1="60" x2="30" y2="60" stroke="#2E7D32" strokeWidth="2" />
        <line x1="90" y1="60" x2="100" y2="60" stroke="#2E7D32" strokeWidth="2" />
      </svg>

      {/* Texto com efeito shimmer */}
      <h1 className="shimmer-text text-4xl md:text-5xl text-center text-green-600">
        MAPAS BRANCO PERES
      </h1>

      {/* Subtítulo */}
      <p className="text-gray-600 text-center text-sm md:text-base">
        Visualização de Fazendas no Mapa
      </p>
    </div>
  );
}
