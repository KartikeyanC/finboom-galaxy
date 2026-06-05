import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";

const KEY = "profile.v1";

interface ProfileData {
  name?: string;
  phone?: string;
  baseCurrency?: "INR" | "USD" | "AED";
}

function read(): ProfileData {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

function write(data: ProfileData) {
  localStorage.setItem(KEY, JSON.stringify(data));
  window.dispatchEvent(new Event("profile:changed"));
}

export function useProfile() {
  const { user } = useAuth();
  const [data, setData] = useState<ProfileData>(() => read());

  useEffect(() => {
    const sync = () => setData(read());
    window.addEventListener("profile:changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("profile:changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const email = user?.email ?? "";
  const fallbackName = email ? email.split("@")[0] : "Guest";
  const name = (data.name && data.name.trim()) || fallbackName;
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const update = useCallback((patch: Partial<ProfileData>) => {
    const next = { ...read(), ...patch };
    write(next);
    setData(next);
  }, []);

  return {
    name,
    rawName: data.name ?? "",
    phone: data.phone ?? "",
    baseCurrency: data.baseCurrency ?? "INR",
    email,
    initials,
    update,
  };
}
