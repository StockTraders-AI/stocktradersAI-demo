import { useEffect, useState } from "react";

export function useNarrow() {
  const [narrow, setNarrow] = useState(() => (typeof window !== "undefined" ? window.innerWidth < 980 : false));

  useEffect(() => {
    const h = () => setNarrow(window.innerWidth < 980);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  return narrow;
}
