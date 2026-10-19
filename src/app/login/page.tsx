"use client";

import { signIn } from "next-auth/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import toast from "react-hot-toast";
import Image from "next/image";
import {
  motion,
  useAnimation,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type Variants,
} from "framer-motion";
import { PageTransitionOverlay } from "@/components/PageTransitionOverlay";
import { NightSky } from "@/components/NightSky";

/* ------------------------------------------------------------------ */
/*  Hooks: Day/Night, Page Visibility, Lite mode                       */
/* ------------------------------------------------------------------ */

function useIsDaytime(force?: boolean | null) {
  const [isDay, setIsDay] = useState(true);

  useEffect(() => {
    if (force !== null && force !== undefined) {
      setIsDay(force);
      return;
    }
    const check = () => {
      const hour = new Date().getHours();
      setIsDay(hour >= 6 && hour < 18);
    };
    check();
    const timer = setInterval(check, 60_000);
    return () => clearInterval(timer);
  }, [force]);

  return isDay;
}

/** false เมื่อแท็บถูกซ่อน → ใช้หยุด interval/timer ของ animation */
function usePageVisible() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === "visible");
    onChange();
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  return visible;
}

/** โหมดเบา: จอเล็ก (มือถือ) หรือเครื่องสเปกต่ำ → ลดของตก + ตัด blur หนักๆ */
function useLiteMode() {
  const [lite, setLite] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const nav = navigator as Navigator & { deviceMemory?: number };
    const lowEnd =
      (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency <= 2) ||
      (nav.deviceMemory !== undefined && nav.deviceMemory <= 2);

    const update = () => setLite(mq.matches || lowEnd);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return lite;
}

const LiteContext = createContext(false);
const useLite = () => useContext(LiteContext);

const REMEMBER_KEY = "stock-req-remember-username";

/** ปุ่มทดสอบมุมขวาบน (กลางวัน / กลางคืน / Auto / จำลองข้อความ)
 *  false = ซ่อน (ฟังก์ชันและโค้ดยังอยู่ครบ) | true = แสดง */
const SHOW_TEST_BUTTONS = false;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ItemType =
  | "box"
  | "shirt"
  | "tool"
  | "helmet"
  | "bottle"
  | "laptop"
  | "gloves"
  | "smallbox"
  | "flashlight"
  | "battery"
  | "radio"
  | "thermos";

type FallingItem = {
  id: number;
  x: number;
  type: ItemType;
  delay: number;
  duration: number;
  breakable: boolean;
  /** 3D depth factor 0-1 (ยิ่งใกล้ผู้ใช้ยิ่งใหญ่) */
  depth: number;
  /** ตำแหน่งพื้นที่ของตกลงมา (% จากขอบล่าง) – ของไกลลงพื้นสูงกว่า */
  floor: number;
  /** มุมเริ่มต้น และจำนวนรอบหมุน (ลงพื้นแบบราบพอดี) */
  rotX0: number;
  rotY0: number;
  rotZ0: number;
  turnsX: number;
  turnsY: number;
  turnsZ: number;
  /** มุมเอียงตอนนอนบนพื้น */
  restTilt: number;
  /** แกว่งซ้าย-ขวาระหว่างตก (px) */
  sway: number;
  /** ของหนัก → ลงพื้นแล้วพื้นร้าว (รอยร้าวหายไปพร้อมของ) */
  heavy: boolean;
  /** เวลาที่นอนอยู่บนพื้นก่อนค่อยๆ จางหาย (ms) */
  rest: number;
};

const HEAVY: ItemType[] = ["tool", "laptop", "radio", "thermos", "box", "battery"];

const DAY_TYPES: ItemType[] = [
  "box",
  "shirt",
  "tool",
  "helmet",
  "bottle",
  "laptop",
  "gloves",
  "smallbox",
];
const NIGHT_TYPES: ItemType[] = [
  "flashlight",
  "battery",
  "radio",
  "thermos",
  "box",
  "tool",
  "gloves",
  "smallbox",
];

function createItem(id: number, isDay: boolean, calm = false): FallingItem {
  const pool = isDay ? DAY_TYPES : NIGHT_TYPES;
  const type = pool[Math.floor(Math.random() * pool.length)];
  const breakable =
    ["bottle", "box", "smallbox", "battery"].includes(type) &&
    Math.random() > 0.45;
  const depth = 0.35 + Math.random() * 0.65; // 3D depth
  const sign = () => (Math.random() > 0.5 ? 1 : -1);

  return {
    id,
    x: 5 + Math.random() * 90,
    type,
    delay: Math.random() * 0.4,
    // ของไกลตกช้ากว่าเล็กน้อย → เกิด parallax
    duration: (3.4 + Math.random() * 1.5) * (1.2 - depth * 0.3) * (calm ? 2.1 : 1),
    breakable,
    depth,
    floor: 1.6 + (1 - depth) * 7,
    rotX0: (Math.random() - 0.5) * 120,
    rotY0: (Math.random() - 0.5) * 120,
    rotZ0: (Math.random() - 0.5) * 80,
    turnsX: sign() * (1 + Math.floor(Math.random() * 2)),
    turnsY: sign() * (1 + Math.floor(Math.random() * 2)),
    turnsZ: Math.floor(Math.random() * 3) - 1,
    restTilt: (Math.random() - 0.5) * 14,
    sway: (Math.random() - 0.5) * 44,
    heavy: HEAVY.includes(type),
    rest: 3600 + Math.random() * 2200,
  };
}

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */

/* ---------- 3D-style icons (layered faces + gradients) ---------- */

function BoxIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="boxTop" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ecd2a0" />
          <stop offset="100%" stopColor="#d4a762" />
        </linearGradient>
        <linearGradient id="boxSide" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a9773a" />
          <stop offset="100%" stopColor="#8a5f2c" />
        </linearGradient>
        <linearGradient id="boxFront" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#dfba7d" />
          <stop offset="100%" stopColor="#c08f4d" />
        </linearGradient>
      </defs>
      {/* side face */}
      <path d="M12 12 L21 7.5 V16.5 L12 21 Z" fill="url(#boxSide)" opacity="0.95" />
      {/* front face */}
      <path d="M3 7.5 L12 12 V21 L3 16.5 Z" fill="url(#boxFront)" />
      {/* top face */}
      <path d="M3 7.5 L12 3 L21 7.5 L12 12 Z" fill="url(#boxTop)" />
      {/* tape */}
      <path d="M7.5 5.25 L16.5 9.75" stroke="#f5e6c4" strokeWidth="1.8" opacity="0.75" />
      {/* edges */}
      <path d="M3 7.5 L12 12 L21 7.5 M12 12 V21" stroke="#7a5226" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M3 7.5 L12 3 L21 7.5 L12 12 L3 7.5 Z" stroke="#8a5f2c" strokeWidth="1.2" fill="none" />
    </svg>
  );
}

function ShirtIcon({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="shirtBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <path
        d="M6 4l-3 3v3h3v10h12V10h3V7l-3-3H6z"
        fill="url(#shirtBody)"
        stroke="#1d4ed8"
        strokeWidth="1.4"
      />
      <path d="M9 4v3h6V4" stroke="#1e40af" strokeWidth="1.4" fill="#93c5fd" fillOpacity="0.6" />
      {/* highlight */}
      <path d="M9.5 10.5h5v8h-5z" fill="#fff" fillOpacity="0.14" />
    </svg>
  );
}

function ToolIcon({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="toolGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f3f4f6" />
          <stop offset="100%" stopColor="#6b7280" />
        </linearGradient>
      </defs>
      <path
        d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
        fill="url(#toolGrad)"
        stroke="#374151"
        strokeWidth="1.35"
      />
      {/* metal highlight */}
      <path d="M16.2 5.2l2.4 2.4" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function HelmetIcon({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="helmTop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="100%" stopColor="#facc15" />
        </linearGradient>
        <linearGradient id="helmBand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ca8a04" />
          <stop offset="100%" stopColor="#a16207" />
        </linearGradient>
      </defs>
      <path
        d="M12 4C8 4 5 8 5 12v2h14v-2c0-4-3-8-7-8z"
        fill="url(#helmTop)"
        stroke="#a16207"
        strokeWidth="1.35"
      />
      <path
        d="M5 14h14v2a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-2z"
        fill="url(#helmBand)"
        stroke="#854d0e"
        strokeWidth="1.15"
      />
      {/* ridge */}
      <path d="M12 4v10" stroke="#ca8a04" strokeWidth="1.2" opacity="0.7" />
      {/* shine */}
      <path d="M8 8.5c1.5-2 3.5-3 4-3" stroke="#fffbe0" strokeWidth="1.3" strokeLinecap="round" opacity="0.85" />
    </svg>
  );
}

function BottleIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="botBody" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1d4ed8" />
          <stop offset="40%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <path
        d="M9 2h6v3l2 3v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V8l2-3V2z"
        fill="url(#botBody)"
        stroke="#1e3a8a"
        strokeWidth="1.35"
      />
      <path d="M9 2h6" stroke="#1e293b" strokeWidth="1.8" strokeLinecap="round" />
      {/* label */}
      <rect x="7.6" y="11.5" width="8.8" height="5" fill="#fff" fillOpacity="0.85" />
      {/* highlight */}
      <path d="M9 9v10" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" opacity="0.35" />
    </svg>
  );
}

function LaptopIcon({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="lapScreen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0369a1" />
        </linearGradient>
        <linearGradient id="lapBase" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e5e7eb" />
          <stop offset="100%" stopColor="#9ca3af" />
        </linearGradient>
      </defs>
      <rect x="3" y="5" width="18" height="12" rx="1.5" fill="url(#lapScreen)" stroke="#374151" strokeWidth="1.5" />
      <path
        d="M2 17h20v1.5a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 18.5V17z"
        fill="url(#lapBase)"
        stroke="#6b7280"
        strokeWidth="1.15"
      />
      {/* screen shine */}
      <rect x="5" y="7" width="6" height="4" rx="0.5" fill="#fff" fillOpacity="0.3" />
    </svg>
  );
}

function GlovesIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="gloveGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#ea580c" />
        </linearGradient>
      </defs>
      <path
        d="M8 4v6H5.5A1.5 1.5 0 0 0 4 11.5V18a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-6.5A1.5 1.5 0 0 0 14.5 10H12V4a2 2 0 0 0-4 0z"
        fill="url(#gloveGrad)"
        stroke="#c2410c"
        strokeWidth="1.3"
      />
      {/* cuff */}
      <path d="M4 17h12" stroke="#9a3412" strokeWidth="1" opacity="0.6" />
      {/* finger crease */}
      <path d="M8 11.5v4M12 11.5v4" stroke="#9a3412" strokeWidth="1" opacity="0.5" />
    </svg>
  );
}

function SmallBoxIcon({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="sboxTop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f0d9ac" />
          <stop offset="100%" stopColor="#d9b273" />
        </linearGradient>
        <linearGradient id="sboxBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d4a762" />
          <stop offset="100%" stopColor="#b8873f" />
        </linearGradient>
      </defs>
      <rect x="5" y="8" width="14" height="11" rx="1.5" fill="url(#sboxBody)" stroke="#7a5226" strokeWidth="1.3" />
      <path d="M5 11h14" stroke="#7a5226" strokeWidth="1.1" />
      <path d="M9 8V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V8" fill="url(#sboxTop)" stroke="#8a5f2c" strokeWidth="1.15" />
      {/* tape */}
      <rect x="10" y="8" width="4" height="3" fill="#f5e6c4" opacity="0.8" />
    </svg>
  );
}

function FlashlightIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="flashBody" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1f2937" />
          <stop offset="45%" stopColor="#4b5563" />
          <stop offset="100%" stopColor="#111827" />
        </linearGradient>
        <radialGradient id="flashBeam" cx="50%" cy="20%" r="60%">
          <stop offset="0%" stopColor="#fef08a" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* soft beam */}
      <ellipse cx="12" cy="4" rx="5" ry="3" fill="url(#flashBeam)" />
      <path d="M9 10h6v10a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V10z" fill="url(#flashBody)" stroke="#0f172a" strokeWidth="1.3" />
      <path d="M9 10V7l1.5-3h3L16 7v3" stroke="#a16207" strokeWidth="1.35" fill="#facc15" fillOpacity="0.95" />
      <path d="M12 14v3" stroke="#facc15" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function BatteryIcon({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="batBody" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#111827" />
          <stop offset="45%" stopColor="#374151" />
          <stop offset="100%" stopColor="#111827" />
        </linearGradient>
      </defs>
      <rect x="6" y="7" width="12" height="14" rx="1.5" fill="url(#batBody)" stroke="#0f172a" strokeWidth="1.3" />
      <path d="M10 7V5h4v2" stroke="#6b7280" strokeWidth="1.4" fill="#d1d5db" />
      {/* label + charge bars */}
      <rect x="8" y="10" width="8" height="9" rx="0.8" fill="#16a34a" />
      <rect x="9" y="11.5" width="6" height="2.2" rx="0.6" fill="#bbf7d0" />
      <rect x="9" y="15" width="4" height="2.2" rx="0.6" fill="#bbf7d0" opacity="0.8" />
    </svg>
  );
}

function RadioIcon({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="radioBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#475569" />
          <stop offset="100%" stopColor="#1e293b" />
        </linearGradient>
      </defs>
      <rect x="3" y="8" width="18" height="12" rx="2" fill="url(#radioBody)" stroke="#0f172a" strokeWidth="1.35" />
      <circle cx="8" cy="14" r="2.5" fill="#f97316" stroke="#fdba74" strokeWidth="1.1" />
      <circle cx="8" cy="14" r="1" fill="#fed7aa" />
      <path d="M14 12h4M14 15h3" stroke="#94a3b8" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M7 8V5l8-2" stroke="#334155" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ThermosIcon({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="thermBody" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#b91c1c" />
          <stop offset="35%" stopColor="#f87171" />
          <stop offset="100%" stopColor="#dc2626" />
        </linearGradient>
      </defs>
      <path
        d="M9 6h6v14a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V6z"
        fill="url(#thermBody)"
        stroke="#7f1d1d"
        strokeWidth="1.3"
      />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="#1f2937" strokeWidth="1.3" fill="#6b7280" />
      <path d="M8 9h8" stroke="#7f1d1d" strokeWidth="1.15" />
      {/* highlight */}
      <path d="M10.5 11v8" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" opacity="0.35" />
    </svg>
  );
}

/** สีจริงของแต่ละอุปกรณ์ ใช้กับเศษแตกและฝุ่น */
const ITEM_COLORS: Record<ItemType, { light: string; dark: string }> = {
  box: { light: "#ecd2a0", dark: "#a9773a" },
  shirt: { light: "#93c5fd", dark: "#2563eb" },
  tool: { light: "#e5e7eb", dark: "#6b7280" },
  helmet: { light: "#fde047", dark: "#ca8a04" },
  bottle: { light: "#93c5fd", dark: "#1d4ed8" },
  laptop: { light: "#d1d5db", dark: "#475569" },
  gloves: { light: "#fdba74", dark: "#c2410c" },
  smallbox: { light: "#f0d9ac", dark: "#b8873f" },
  flashlight: { light: "#fde68a", dark: "#374151" },
  battery: { light: "#4ade80", dark: "#1f2937" },
  radio: { light: "#94a3b8", dark: "#1e293b" },
  thermos: { light: "#fca5a5", dark: "#b91c1c" },
};

const IconMap: Record<ItemType, React.FC<{ size?: number }>> = {
  box: BoxIcon,
  shirt: ShirtIcon,
  tool: ToolIcon,
  helmet: HelmetIcon,
  bottle: BottleIcon,
  laptop: LaptopIcon,
  gloves: GlovesIcon,
  smallbox: SmallBoxIcon,
  flashlight: FlashlightIcon,
  battery: BatteryIcon,
  radio: RadioIcon,
  thermos: ThermosIcon,
};

/* ------------------------------------------------------------------ */
/*  Dust + 3D Shards                                                   */
/* ------------------------------------------------------------------ */

function DustParticles({
  x,
  floor,
  color,
}: {
  x: number;
  floor: number;
  color: string;
}) {
  const particles = useMemo(
    () =>
      Array.from({ length: 9 }).map((_, i) => ({
        id: i,
        angle: (i / 9) * Math.PI * 2 + (Math.random() - 0.5) * 0.7,
        dist: 16 + Math.random() * 30,
        size: 2.2 + Math.random() * 3.2,
        delay: Math.random() * 0.07,
      })),
    []
  );

  return (
    <>
      {particles.map((p) => (
        <motion.span
          key={p.id}
          className="absolute rounded-full"
          style={{
            background: color,
            left: `${x}%`,
            top: `${-floor}%`,
            width: p.size,
            height: p.size,
            x: "-50%",
          }}
          initial={{ x: "-50%", y: 0, opacity: 0.9, scale: 1 }}
          animate={{
            x: `calc(-50% + ${Math.cos(p.angle) * p.dist}px)`,
            y: -Math.abs(Math.sin(p.angle)) * p.dist * 0.75 - 8,
            opacity: 0,
            scale: 0.25,
          }}
          transition={{ duration: 0.55, delay: p.delay, ease: "easeOut" }}
        />
      ))}
    </>
  );
}

const SHARD_CLIPS = [
  "polygon(0 0, 100% 20%, 40% 100%)",
  "polygon(10% 0, 100% 0, 60% 100%)",
  "polygon(0 30%, 100% 0, 70% 100%)",
  "polygon(0 100%, 50% 0, 100% 80%)",
];

/** เศษแตกแบบ 3D: ลอยออกทั้งซ้าย/ขวาและเข้า-ออกหาผู้ใช้ พร้อมหมุนรอบ 3 แกน */
function Fragments({
  x,
  floor,
  colors,
}: {
  x: number;
  floor: number;
  colors: { light: string; dark: string };
}) {
  const lite = useLite();
  const n = lite ? 5 : 8;

  const shards = useMemo(
    () =>
      Array.from({ length: n }).map((_, i) => {
        const dir = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.8;
        const dist = 26 + Math.random() * 46;
        return {
          id: i,
          clip: SHARD_CLIPS[i % SHARD_CLIPS.length],
          light: i % 2 === 0,
          dx: Math.cos(dir) * dist,
          z: Math.sin(dir) * dist * 1.6,
          up: 22 + Math.random() * 34,
          rx: (Math.random() - 0.5) * 720,
          ry: (Math.random() - 0.5) * 720,
          rz: (Math.random() - 0.5) * 540,
          size: 9 + Math.random() * 10,
          delay: Math.random() * 0.05,
        };
      }),
    [n]
  );

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${x}%`,
        top: `${100 - floor}vh`,
        width: 0,
        height: 0,
        perspective: 520,
      }}
    >
      {shards.map((s) => {
        const kf = {
          duration: 0.8,
          delay: s.delay,
          times: [0, 0.45, 1],
          ease: "easeOut" as const,
        };
        return (
          <motion.div
            key={s.id}
            className="absolute"
            style={{
              width: s.size,
              height: s.size * 0.8,
              left: -s.size / 2,
              top: -s.size,
              clipPath: s.clip,
              background: s.light
                ? `linear-gradient(135deg, ${colors.light}, ${colors.dark})`
                : colors.dark,
            }}
            initial={{ x: 0, y: 0, z: 0, opacity: 1, scale: 1 }}
            animate={{
              x: [0, s.dx * 0.6, s.dx],
              y: [0, -s.up, 4],
              z: [0, s.z * 0.6, s.z],
              rotateX: s.rx,
              rotateY: s.ry,
              rotateZ: s.rz,
              opacity: [1, 1, 0],
              scale: [1, 1, 0.6],
            }}
            transition={{
              x: kf,
              z: kf,
              y: { ...kf, ease: ["easeOut", "easeIn"] },
              opacity: { ...kf, times: [0, 0.6, 1] },
              scale: { ...kf, times: [0, 0.6, 1] },
              rotateX: { duration: 0.8, delay: s.delay, ease: "easeOut" },
              rotateY: { duration: 0.8, delay: s.delay, ease: "easeOut" },
              rotateZ: { duration: 0.8, delay: s.delay, ease: "easeOut" },
            }}
          />
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  RestLife: ชีวิตเล็กๆ บนของที่นอนอยู่ (ประกายหมวก / ไฟฉายกะพริบ)        */
/* ------------------------------------------------------------------ */

function RestLife({ type, x, top, scale, seed }: { type: ItemType; x: number; top: number; scale: number; seed: number }) {
  if (type !== "helmet" && type !== "flashlight") return null;
  const delay = 0.4 + (seed % 5) * 0.55;
  return (
    <div
      className="absolute pointer-events-none z-10"
      style={{ left: `${x}%`, top: `${top}vh`, width: 0, height: 0 }}
      aria-hidden
    >
      {type === "helmet" ? (
        <motion.svg
          width={16 * scale} height={16 * scale} viewBox="-8 -8 16 16"
          style={{ position: "absolute", left: -9 * scale - 8 * scale, top: -33 * scale - 8 * scale, overflow: "visible" }}
          initial={{ scale: 0, opacity: 0, rotate: 0 }}
          animate={{ scale: [0, 1, 0], opacity: [0, 1, 0], rotate: [0, 70, 140] }}
          transition={{ duration: 0.9, delay, repeat: Infinity, repeatDelay: 3.2, ease: "easeOut" }}
        >
          <path d="M0 -8 L1.6 -1.6 L8 0 L1.6 1.6 L0 8 L-1.6 1.6 L-8 0 L-1.6 -1.6Z" fill="#fbbf24" />
          <path d="M0 -4.5 L0.9 -0.9 L4.5 0 L0.9 0.9 L0 4.5 L-0.9 0.9 L-4.5 0 L-0.9 -0.9Z" fill="#fff" />
        </motion.svg>
      ) : (
        <motion.div
          className="absolute rounded-full"
          style={{
            width: 34 * scale, height: 34 * scale, left: 4 * scale, top: -34 * scale,
            background: "radial-gradient(circle, rgba(253,224,71,0.75) 0%, rgba(253,224,71,0) 70%)",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.9, 0.2, 0.7, 0] }}
          transition={{ duration: 1.6, delay, repeat: Infinity, repeatDelay: 2.4, ease: "easeInOut" }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FlyToBox: ของที่นอนอยู่บินโค้งเข้ากล่องบนรถยก (ฉากปิดตอนล็อกอินสำเร็จ)  */
/* ------------------------------------------------------------------ */

function FlyToBox({ type, startX, startY, scale, idx, dir }: {
  type: ItemType; startX: number; startY: number; scale: number; idx: number; dir: 1 | -1;
}) {
  const Icon = IconMap[type];
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // ตำแหน่งกล่องบนรถยก ณ เวลา T (สูตรเดียวกับ ForkliftEvent ตอนฉากปิด: วิ่งเส้นตรง 2.2 วิ)
  const T = 0.75 + idx * 0.1;
  const span = vw + CAR_W + 20;
  const base = dir === 1 ? -CAR_W - 10 + (CAR_W - 31) : vw + 10 + 31;
  const boxX = base + (dir === 1 ? span : -span) * (T / 2.2);
  const boxY = vh * 0.94 - 73;
  const apex = Math.min(startY, boxY) - 90 - idx * 8;
  const s = scale * 0.9;
  return (
    <motion.div
      className="absolute pointer-events-none z-30"
      style={{ left: 0, top: 0, width: ITEM_BOX, height: ITEM_BOX, marginLeft: -ITEM_BOX / 2, marginTop: -ITEM_BOX / 2 }}
      initial={{ x: startX, y: startY, scale: s, opacity: 1, rotate: 0 }}
      animate={{
        x: [startX, (startX + boxX) / 2, boxX],
        y: [startY, apex, boxY],
        scale: [s, s * 1.12, s * 0.25],
        opacity: [1, 1, 1, 0],
        rotate: [0, (idx % 2 ? 1 : -1) * 18, 0],
      }}
      transition={{
        duration: T,
        delay: 0.05,
        times: [0, 0.5, 1],
        x: { duration: T, ease: "easeInOut", times: [0, 0.5, 1] },
        y: { duration: T, times: [0, 0.5, 1], ease: ["easeOut", "easeIn"] },
        scale: { duration: T, times: [0, 0.5, 1], ease: "easeIn" },
        opacity: { duration: T, times: [0, 0.7, 0.92, 1] },
        rotate: { duration: T, times: [0, 0.5, 1] },
      }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <Icon />
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Cracks: รอยร้าวบนพื้นเมื่อของหนักตก (จางหายไปพร้อมกับของ)           */
/* ------------------------------------------------------------------ */

function Cracks({ x, floor, size, fading }: { x: number; floor: number; size: number; fading: boolean }) {
  const paths = useMemo(() => {
    const f = (n: number) => n.toFixed(1);
    return Array.from({ length: 6 }).map((_, i) => {
      let a = (i / 6) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
      let px = 50, py = 50, d = "M50 50";
      const segs = 3 + Math.floor(Math.random() * 2);
      for (let s = 0; s < segs; s++) {
        a += (Math.random() - 0.5) * 0.9;
        const l = 9 + Math.random() * 10;
        px += Math.cos(a) * l;
        py += Math.sin(a) * l;
        d += ` L${f(px)} ${f(py)}`;
        if (s === 1 && Math.random() > 0.4) {
          const br = a + (Math.random() > 0.5 ? 0.8 : -0.8);
          d += ` L${f(px + Math.cos(br) * 8)} ${f(py + Math.sin(br) * 8)} M${f(px)} ${f(py)}`;
        }
      }
      return d;
    });
  }, []);

  return (
    <motion.div
      className="absolute pointer-events-none z-0"
      style={{ left: `${x}%`, top: `${100 - floor}vh`, width: 0, height: 0, perspective: 500 }}
      initial={{ opacity: 1 }}
      animate={{ opacity: fading ? 0 : 1 }}
      transition={{ duration: 0.7 }}
    >
      <svg width={size} height={size} viewBox="0 0 100 100"
        style={{ position: "absolute", left: -size / 2, top: -size / 2, transform: "rotateX(68deg)", overflow: "visible" }}>
        {[{ s: "rgba(255,255,255,0.55)", w: 3.4, dy: 1.4 }, { s: "rgba(15,23,42,0.7)", w: 1.7, dy: 0 }].map((l, k) =>
          paths.map((d, i) => (
            <motion.path key={`${k}-${i}`} d={d} transform={`translate(0 ${l.dy})`} fill="none" stroke={l.s}
              strokeWidth={l.w} strokeLinecap="round" strokeLinejoin="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
              transition={{ duration: 0.32, delay: 0.04 + i * 0.02, ease: "easeOut" }} />
          ))
        )}
        <motion.circle cx="50" cy="50" r="6" fill="rgba(15,23,42,0.35)"
          initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.2 }} style={{ transformOrigin: "50px 50px" }} />
      </svg>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Falling Item  (3D tumble + depth + squash)       */
/* ------------------------------------------------------------------ */

const ITEM_BOX = 48;

function FallingItemView({
  item,
  onComplete,
  reduce,
  successMode,
  errorShake,
  finaleDir,
}: {
  item: FallingItem;
  onComplete: (id: number) => void;
  reduce: boolean;
  successMode: boolean;
  errorShake: boolean;
  finaleDir: 1 | -1;
}) {
  const lite = useLite();
  const Icon = IconMap[item.type];
  const [phase, setPhase] = useState<
    "falling" | "bounce" | "rest" | "fade" | "collect" | "break" | "impact" | "flyup" | "done"
  >("falling");

  useEffect(() => {
    if (!successMode) return;
    if (phase === "falling" || phase === "bounce") setPhase("flyup");
    // ของที่นอนอยู่บนพื้น → บินเข้ากล่องบนรถยก
    else if (phase === "rest" || phase === "fade") setPhase(lite ? "flyup" : "collect");
  }, [successMode, phase, lite]);

  const handleFallComplete = () => {
    if (reduce || successMode) {
      onComplete(item.id);
      return;
    }
    if (item.breakable) setPhase("break");
    else setPhase("bounce");
  };

  // เส้นเวลาหลังตก: bounce → rest (นอนอยู่บนพื้นสักพัก) → fade → done
  useEffect(() => {
    const next: Partial<Record<typeof phase, [typeof phase, number]>> = {
      bounce: ["rest", 720],
      rest: ["fade", item.rest],
      fade: ["done", 700],
      break: ["impact", 180],
      impact: ["done", 1500],
      flyup: ["done", 900],
      collect: ["done", 1700],
    };
    const n = next[phase];
    if (!n) return;
    const tm = setTimeout(() => {
      setPhase(n[0]);
      if (n[0] === "done") onComplete(item.id);
    }, n[1]);
    return () => clearTimeout(tm);
  }, [phase, item.id, item.rest, onComplete]);

  if (phase === "done") return null;

  const { floor, depth } = item;
  const landVh = 100 - floor; // ของไกล (depth น้อย) ลงพื้นสูงกว่า → ให้ความรู้สึกลึก
  const baseScale = 0.62 + depth * 0.6;
  const itemOpacity = 0.72 + depth * 0.28;
  const far = depth < 0.55;
  const light = item.type === "shirt" || item.type === "gloves";
  const hopH = item.heavy ? 2.2 : light ? 6 : 4.2; // ของหนักเด้งเตี้ย ของเบาเด้งสูง

  const bounceTimes = [0, 0.3, 0.55, 0.75, 1];
  const hop = (h: number) => [
    `${landVh}vh`,
    `${landVh - h}vh`,
    `${landVh}vh`,
    `${landVh - h * 0.33}vh`,
    `${landVh}vh`,
  ];

  const endX = item.turnsX * 360;
  const endY = item.turnsY * 360;
  const endZ = item.restTilt + item.turnsZ * 360;

  const filterStr = lite || !far ? undefined : "blur(0.6px)";

  return (
    <>
      {(phase === "falling" || phase === "bounce" || phase === "rest" || phase === "fade" || phase === "flyup") && (
        <motion.div
          className="absolute pointer-events-none z-10"
          style={{ left: `${item.x}%`, top: 0, width: 0, height: 0 }}
          initial={{ y: "0vh", opacity: itemOpacity, scale: baseScale * 0.9 }}
          animate={
            phase === "falling"
              ? { y: `${landVh}vh`, opacity: itemOpacity, scale: baseScale }
              : phase === "bounce"
                ? { y: hop(hopH), opacity: itemOpacity, scale: baseScale }
                : phase === "rest"
                  ? { y: `${landVh}vh`, opacity: itemOpacity, scale: baseScale }
                  : phase === "fade"
                    ? { y: `${landVh}vh`, opacity: 0, scale: baseScale * 0.94 }
                    : { y: "-40vh", opacity: 0, scale: baseScale * 1.7 }
          }
          transition={
            phase === "falling"
              ? {
                  duration: item.duration,
                  delay: item.delay,
                  ease: [0.45, 0, 0.85, 0.55],
                }
              : phase === "bounce"
                ? {
                    y: {
                      duration: 0.72,
                      times: bounceTimes,
                      ease: ["easeOut", "easeIn", "easeOut", "easeIn"],
                    },
                  }
                : phase === "rest"
                  ? { duration: 0 }
                  : phase === "fade"
                    ? { duration: 0.7, ease: "easeOut" }
                    : { duration: 0.9, ease: "easeIn" }
          }
          onAnimationComplete={() => {
            if (phase === "falling") handleFallComplete();
          }}
        >
          {/* squash & stretch: ยึดที่เท้า (ขอบล่าง) */}
          <motion.div
            className="absolute"
            style={{
              left: 0,
              top: 0,
              x: "-50%",
              y: "-86%",
              width: ITEM_BOX,
              height: ITEM_BOX,
              transformOrigin: "50% 100%",
              filter: filterStr,
            }}
            initial={{ scaleX: 1, scaleY: 1 }}
            animate={
              phase === "bounce"
                ? {
                    scaleX: [1.18, 0.95, 1.08, 0.98, 1],
                    scaleY: [0.78, 1.08, 0.9, 1.03, 1],
                  }
                : phase === "falling"
                  ? { scaleX: 0.97, scaleY: 1.04 }
                  : { scaleX: 1, scaleY: 1 }
            }
            transition={
              phase === "bounce"
                ? { duration: 0.72, times: bounceTimes, ease: "easeOut" }
                : { duration: 0.2 }
            }
          >
            {/* แกว่งซ้าย-ขวาระหว่างตก */}
            <motion.div
              className="absolute inset-0"
              animate={{
                x:
                  phase === "falling"
                    ? [0, item.sway, -item.sway * 0.6, 0]
                    : 0,
              }}
              transition={
                phase === "falling"
                  ? {
                      duration: item.duration,
                      delay: item.delay,
                      ease: "easeInOut",
                    }
                  : { duration: 0.2 }
              }
            >
              {/* สั่นเมื่อรหัสผิด + กำหนด perspective ให้ชิ้นที่หมุน */}
              <motion.div
                className="absolute inset-0"
                style={{ perspective: 520 }}
                animate={{
                  x: errorShake ? [0, -9, 8, -6, 5, -3, 0] : 0,
                }}
                transition={{ duration: errorShake ? 0.5 : 0.1, ease: "easeInOut" }}
              >
                {/* ตัวหมุน 3 แกน: ตกลงมาแล้วหมุนช้าลงจนราบพอดีตอนถึงพื้น */}
                <motion.div
                  className="absolute inset-0"
                  style={{ transformStyle: "preserve-3d" }}
                  initial={{
                    rotateX: item.rotX0,
                    rotateY: item.rotY0,
                    rotateZ: item.rotZ0,
                  }}
                  animate={
                    phase === "falling"
                      ? { rotateX: endX, rotateY: endY, rotateZ: endZ }
                      : phase === "bounce"
                        ? {
                            rotateX: endX,
                            rotateY: endY,
                            rotateZ: [endZ, endZ + 6, endZ - 3, endZ + 1, endZ],
                          }
                        : phase === "rest" || phase === "fade"
                          ? { rotateX: endX, rotateY: endY, rotateZ: endZ }
                          : {
                            rotateX: endX - 40,
                            rotateY: endY + 180,
                            rotateZ: endZ + 40,
                          }
                  }
                  transition={
                    phase === "falling"
                      ? {
                          duration: item.duration,
                          delay: item.delay,
                          ease: [0.2, 0.6, 0.4, 1],
                        }
                      : phase === "bounce"
                        ? {
                            rotateZ: {
                              duration: 0.72,
                              times: bounceTimes,
                              ease: "easeOut",
                            },
                          }
                        : phase === "rest" || phase === "fade"
                          ? { duration: 0 }
                          : { duration: 0.9, ease: "easeIn" }
                  }
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Icon />
                  </div>
                </motion.div>
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}

      {item.breakable && (phase === "break" || phase === "impact") && (
        <Fragments x={item.x} floor={floor} colors={ITEM_COLORS[item.type]} />
      )}

      {!lite && phase === "rest" && (
        <RestLife type={item.type} x={item.x} top={landVh} scale={baseScale} seed={item.id} />
      )}

      {phase === "collect" && (
        <FlyToBox
          type={item.type}
          startX={(item.x / 100) * window.innerWidth}
          startY={(landVh / 100) * window.innerHeight - 17 * baseScale}
          scale={baseScale}
          idx={item.id % 7}
          dir={finaleDir}
        />
      )}

      {item.heavy && !item.breakable && (phase === "bounce" || phase === "rest" || phase === "fade" || phase === "collect") && (
        <Cracks x={item.x} floor={floor} size={56 + depth * 40} fading={phase === "fade" || phase === "collect"} />
      )}

      {(phase === "impact" || phase === "bounce") && (
        <div
          className="absolute pointer-events-none z-0"
          style={{
            left: `${item.x}%`,
            top: `${100 - floor}vh`,
            width: 0,
            height: 0,
            perspective: 400,
          }}
        >
          {/* แสงวาบบนพื้น */}
          {!lite && (
            <motion.div
              className="absolute rounded-[50%]"
              style={{
                width: 96,
                height: 28,
                left: -48,
                top: -14,
                background:
                  "radial-gradient(ellipse at center, rgba(52,211,153,0.5) 0%, rgba(52,211,153,0) 70%)",
              }}
              initial={{ scale: 0.3, opacity: 0.9 }}
              animate={{ scale: 1.7, opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          )}
          {/* วงคลื่นแผ่ราบไปกับพื้น (หมุนแกน X ให้เป็นระนาบพื้น) */}
          {[0, 0.09].map((d, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{
                width: i === 0 ? 76 : 52,
                height: i === 0 ? 76 : 52,
                left: i === 0 ? -38 : -26,
                top: i === 0 ? -38 : -26,
                border: "2px solid rgba(52,211,153,0.55)",
                rotateX: 72,
              }}
              initial={{ scale: 0.2, opacity: 0.9 }}
              animate={{ scale: 1.9, opacity: 0 }}
              transition={{ duration: 0.7, delay: d, ease: "easeOut" }}
            />
          ))}
          <DustParticles x={50} floor={0} color={ITEM_COLORS[item.type].dark} />
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Manager (หยุดเมื่อแท็บถูกซ่อน / ลดจำนวนในโหมดเบา)                    */
/* ------------------------------------------------------------------ */

function FallingItemsManager({
  reduce,
  isDay,
  successMode,
  errorShake,
  calm,
  finaleDir,
}: {
  reduce: boolean;
  isDay: boolean;
  successMode: boolean;
  errorShake: boolean;
  calm: boolean;
  finaleDir: 1 | -1;
}) {
  // ใช้ ref เพื่อให้สลับโหมดช้า/ปกติได้โดยไม่รีเซ็ตของที่กำลังตกอยู่
  const calmRef = useRef(calm);
  useEffect(() => {
    calmRef.current = calm;
  }, [calm]);
  const lite = useLite();
  const visible = usePageVisible();
  const [items, setItems] = useState<FallingItem[]>([]);

  const maxItems = lite ? 4 : 7;
  const initialCount = lite ? 2 : 3;
  const spawnMs = lite ? 2200 : 1500;

  useEffect(() => {
    if (reduce || successMode) return;

    if (!visible) {
      setItems([]);
      return;
    }

    let idCounter = 0;
    setItems(
      Array.from({ length: initialCount }).map(() =>
        createItem(idCounter++, isDay)
      )
    );

    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(
        () => {
          setItems((prev) => {
            if (prev.length >= (calmRef.current ? Math.min(maxItems, 3) : maxItems)) return prev;
            return [...prev, createItem(idCounter++, isDay, calmRef.current)];
          });
          schedule();
        },
        spawnMs * (calmRef.current ? 1.8 : 1)
      );
    };
    schedule();

    return () => clearTimeout(timer);
  }, [reduce, isDay, successMode, visible, maxItems, initialCount, spawnMs]);

  const removeItem = useCallback((id: number) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  if (reduce) return null;

  return (
    <div
      className={isDay ? "fi-layer" : "fi-layer fi-night"}
      style={{ transformStyle: "preserve-3d", perspective: 1200 }}
    >
      {items.map((item) => (
        <FallingItemView
          key={item.id}
          item={item}
          onComplete={removeItem}
          reduce={reduce}
          successMode={successMode}
          errorShake={errorShake}
          finaleDir={finaleDir}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Warehouse Ambient – พื้นคลังเบา ๆ เท่านั้น                          */
/* ------------------------------------------------------------------ */

function WarehouseAmbient({
  reduce,
  isDay,
}: {
  reduce: boolean;
  isDay: boolean;
}) {
  const lite = useLite();
  if (reduce || lite) return null;

  const lineColor = isDay ? "rgba(16,185,129,0.10)" : "rgba(167,139,250,0.09)";

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
      {/* พื้นคลังเบา ๆ เฉพาะครึ่งล่าง */}
      <div
        className="absolute left-0 right-0 bottom-0"
        style={{
          height: "38%",
          background: isDay
            ? "linear-gradient(to top, rgba(16,185,129,0.05) 0%, transparent 75%)"
            : "linear-gradient(to top, rgba(99,102,241,0.06) 0%, transparent 75%)",
          maskImage: "linear-gradient(to top, black 25%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to top, black 25%, transparent 100%)",
        }}
      >
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
          {[22, 38, 50, 62, 78].map((x, i) => (
            <line
              key={`v-${i}`}
              x1={`${x}%`}
              y1="100%"
              x2={`${42 + (x - 50) * 0.3}%`}
              y2="8%"
              stroke={lineColor}
              strokeWidth="0.9"
            />
          ))}
          {[40, 62, 82].map((y, i) => (
            <line
              key={`h-${i}`}
              x1="8%"
              y1={`${y}%`}
              x2="92%"
              y2={`${y}%`}
              stroke={lineColor}
              strokeWidth="0.7"
              opacity={0.55 - i * 0.12}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Forklift: กล่องสุ่มตก + รถมาจากซ้าย/ขวา + ฝุ่น + ไฟหมุน + ฉากปิดท้าย */
/* ------------------------------------------------------------------ */

type ForkPhase = "idle" | "boxFall" | "lifting" | "drive";

type ForkCfg = {
  id: number;
  dir: 1 | -1;
  dropPx: number;
  stopLeft: number;
  startX: number;
  exitX: number;
  tilt: number;
  vh: number;
  driveSec: number;
  finale: boolean;
};

const CAR_W = 230;
const CAR_H = 120;

function Wheel({
  cx,
  cy,
  r,
  moving,
  spin,
}: {
  cx: number;
  cy: number;
  r: number;
  moving: boolean;
  spin: number;
}) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#4b5563" />
      <motion.g
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
        animate={{ rotate: moving ? spin : 0 }}
        transition={
          moving
            ? { duration: 0.6, repeat: Infinity, ease: "linear" }
            : { duration: 0 }
        }
      >
        <circle cx={cx} cy={cy} r={r * 0.55} fill="#d1d5db" />
        <path
          d={`M${cx - r * 0.45} ${cy} H${cx + r * 0.45} M${cx} ${cy - r * 0.45} V${cy + r * 0.45}`}
          stroke="#9ca3af"
          strokeWidth="1.5"
        />
      </motion.g>
      <circle cx={cx} cy={cy} r={r * 0.15} fill="#6b7280" />
    </g>
  );
}

function BoxShape() {
  return (
    <>
      <rect x="6" y="58" width="50" height="46" fill="#e8c98a" />
      <rect x="6" y="58" width="50" height="9" fill="#d9b673" />
      <rect x="26" y="58" width="10" height="9" fill="#c9a15a" opacity="0.7" />
      <rect x="12" y="78" width="12" height="8" rx="1" fill="#f5e3b8" opacity="0.8" />
      <rect x="6" y="58" width="50" height="46" stroke="#c9a15a" strokeWidth="1.2" />
    </>
  );
}

function Beacon({ isDay }: { isDay: boolean }) {
  const glowR = isDay ? 16 : 32;
  const glowO = isDay ? 0.5 : 0.95;
  const beam = isDay ? 0.3 : 0.75;

  return (
    <g>
      <defs>
        <radialGradient id="beaconGlow">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="beamR" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="beamL" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
        </linearGradient>
      </defs>

      <motion.path
        d="M142 11 L198 -2 L198 24 Z"
        fill="url(#beamR)"
        animate={{ opacity: [beam, 0, beam] }}
        transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.path
        d="M138 11 L82 -2 L82 24 Z"
        fill="url(#beamL)"
        animate={{ opacity: [0, beam, 0] }}
        transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.circle
        cx="140"
        cy="11"
        r={glowR}
        fill="url(#beaconGlow)"
        animate={{ opacity: [glowO * 0.3, glowO, glowO * 0.3] }}
        transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
      />
      <rect x="132" y="16" width="16" height="4" rx="1" fill="#374151" />
      <motion.path
        d="M133 16 Q133 6 140 6 Q147 6 147 16 Z"
        animate={{ fill: ["#f59e0b", "#fde68a", "#f59e0b"] }}
        transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
      />
    </g>
  );
}

function GroundDust({
  x,
  delay,
  bias,
  count,
  size,
}: {
  x: number;
  delay: number;
  bias: number;
  count: number;
  size: number;
}) {
  const lite = useLite();
  const n = lite ? Math.max(4, Math.round(count * 0.6)) : count;

  const parts = useMemo(
    () =>
      Array.from({ length: n }).map((_, i) => ({
        id: i,
        dx:
          bias === 0
            ? (i % 2 ? 1 : -1) * (10 + Math.random() * 50)
            : bias * (15 + Math.random() * 55) + (Math.random() - 0.5) * 24,
        dy: 8 + Math.random() * 22,
        s: (5 + Math.random() * 7) * size,
        d: delay + Math.random() * 0.09,
        grow: 1.6 + Math.random() * 1.2,
      })),
    [n, bias, delay, size]
  );

  return (
    <div
      className="absolute pointer-events-none"
      style={{ left: x, bottom: "calc(6% + 4px)" }}
    >
      {parts.map((p) => (
        <motion.span
          key={p.id}
          className="absolute rounded-full"
          style={{
            width: p.s,
            height: p.s,
            left: -p.s / 2,
            top: -p.s,
            background:
              "radial-gradient(circle at 40% 40%, rgba(226,232,240,0.95), rgba(148,163,184,0.55) 70%, transparent 100%)",
            filter: lite ? undefined : "blur(1px)",
          }}
          initial={{ x: 0, y: 0, scale: 0.3, opacity: 0 }}
          animate={{ x: p.dx, y: -p.dy, scale: p.grow, opacity: [0, 0.75, 0] }}
          transition={{
            duration: 0.85,
            delay: p.d,
            ease: "easeOut",
            opacity: { duration: 0.85, delay: p.d, times: [0, 0.2, 1] },
          }}
        />
      ))}
    </div>
  );
}

type Puff = {
  id: number;
  size: number;
  dx: number;
  dy: number;
  grow: number;
  dark: boolean;
};

function ExhaustSmoke({
  heavy,
  dir,
  originX,
}: {
  heavy: boolean;
  dir: 1 | -1;
  originX: number;
}) {
  const lite = useLite();
  const [puffs, setPuffs] = useState<Puff[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    const ms = heavy ? (lite ? 180 : 110) : lite ? 400 : 280;
    const keep = lite ? 8 : 14;

    const iv = setInterval(() => {
      const id = idRef.current++;
      const spread = heavy ? 70 : 24;
      setPuffs((p) => [
        ...p.slice(-keep),
        {
          id,
          size: (heavy ? 16 : 10) + Math.random() * 8,
          dx: -dir * (spread + Math.random() * spread),
          dy: -(26 + Math.random() * 36),
          grow: 1.8 + Math.random() * 1.3,
          dark: heavy && Math.random() > 0.55,
        },
      ]);
    }, ms);
    return () => clearInterval(iv);
  }, [heavy, dir, lite]);

  const remove = (id: number) => setPuffs((p) => p.filter((x) => x.id !== id));

  return (
    <div
      className="absolute pointer-events-none"
      style={{ left: originX, bottom: CAR_H - 40 }}
    >
      {puffs.map((p) => (
        <motion.span
          key={p.id}
          className="absolute rounded-full"
          style={{
            width: p.size,
            height: p.size,
            left: -p.size / 2,
            top: -p.size / 2,
            background: p.dark
              ? "radial-gradient(circle at 35% 35%, rgba(148,163,184,0.85), rgba(71,85,105,0.5) 65%, transparent 100%)"
              : "radial-gradient(circle at 35% 35%, rgba(241,245,249,0.95), rgba(148,163,184,0.5) 65%, transparent 100%)",
            filter: lite ? undefined : "blur(1.5px)",
          }}
          initial={{ x: 0, y: 0, scale: 0.4, opacity: 0.7 }}
          animate={{ x: p.dx, y: p.dy, scale: p.grow, opacity: 0 }}
          transition={{ duration: heavy ? 1.2 : 1.5, ease: "easeOut" }}
          onAnimationComplete={() => remove(p.id)}
        />
      ))}
    </div>
  );
}

function treadUrl(dir: 1 | -1) {
  const d =
    dir === 1
      ? "M0.5 1 L4 3.5 L0.5 6 M4.5 1 L8 3.5 L4.5 6"
      : "M3.5 1 L0 3.5 L3.5 6 M7.5 1 L4 3.5 L7.5 6";
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='8' height='7'><path d='${d}' stroke='rgb(51,65,85)' stroke-opacity='0.5' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round' fill='none'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function TireTracks({ cfg }: { cfg: ForkCfg }) {
  const wheelCenter = cfg.dir === 1 ? 89 : 141;
  const startW = cfg.stopLeft + wheelCenter;
  const left = Math.min(startW, startW + cfg.exitX);
  const width = Math.abs(cfg.exitX);
  const fadeDir = cfg.dir === 1 ? "to right" : "to left";
  const mask = `linear-gradient(${fadeDir}, transparent 0, black 14%, black 100%)`;

  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{
        left,
        width,
        bottom: "calc(6% + 1px)",
        height: 7,
        borderRadius: 4,
        backgroundColor: "rgba(71,85,105,0.10)",
        backgroundImage: treadUrl(cfg.dir),
        backgroundRepeat: "repeat-x",
        backgroundSize: "8px 7px",
        WebkitMaskImage: mask,
        maskImage: mask,
      }}
      initial={{
        clipPath: cfg.dir === 1 ? "inset(0 100% 0 0)" : "inset(0 0 0 100%)",
        opacity: 0.9,
      }}
      animate={{
        clipPath: cfg.dir === 1 ? "inset(0 0% 0 0)" : "inset(0 0 0 0%)",
        opacity: [0.9, 0.9, 0],
      }}
      transition={{
        clipPath: { duration: cfg.driveSec, ease: "linear" },
        opacity: {
          duration: cfg.driveSec + 2.2,
          times: [0, 0.55, 1],
          ease: "easeOut",
        },
      }}
    />
  );
}

function ForkliftEvent({
  reduce,
  isDay,
  successMode,
  finaleDir,
}: {
  reduce: boolean;
  isDay: boolean;
  successMode: boolean;
  finaleDir: 1 | -1;
}) {
  const visible = usePageVisible();
  const [phase, setPhase] = useState<ForkPhase>("idle");
  const [cfg, setCfg] = useState<ForkCfg | null>(null);
  const [bubble, setBubble] = useState(false);
  const [honkCount, setHonkCount] = useState(0);
  const busy = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const honkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const bounce = useAnimation();

  useEffect(() => {
    if (reduce || successMode) return;

    if (!visible) {
      setPhase("idle");
      return;
    }

    const later = (fn: () => void, ms: number) => {
      timers.current.push(setTimeout(fn, ms));
    };

    const startSequence = () => {
      if (busy.current) return;
      busy.current = true;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const dir: 1 | -1 = Math.random() > 0.5 ? 1 : -1;

      const anchor = dir === 1 ? 199 : 31;
      const lo = dir === 1 ? 209 : 41;
      const hi = dir === 1 ? vw - 41 : vw - 209;
      const dropPx = hi > lo ? lo + Math.random() * (hi - lo) : vw / 2;

      const stopLeft = dropPx - anchor;
      const startX = dir === 1 ? -CAR_W - 10 - stopLeft : vw + 10 - stopLeft;
      const exitX = dir === 1 ? vw + 10 - stopLeft : -CAR_W - 10 - stopLeft;
      const driveSec = 3.6;

      setCfg({
        id: seq.current++,
        dir,
        dropPx,
        stopLeft,
        startX,
        exitX,
        tilt: (Math.random() - 0.5) * 36,
        vh,
        driveSec,
        finale: false,
      });

      setPhase("boxFall");
      later(() => setPhase("lifting"), 2200);
      later(() => setPhase("drive"), 3400);
      const carExitMs = 3400 + driveSec * 1000;
      later(() => {
        setPhase("idle");
        busy.current = false;
      }, carExitMs + 2300);

      later(startSequence, carExitMs + 5000 + Math.random() * 5000);
    };

    later(startSequence, 2000);

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      busy.current = false;
    };
  }, [reduce, successMode, visible]);

  useEffect(() => {
    if (!successMode || reduce) return;

    timers.current.forEach(clearTimeout);
    timers.current = [];
    busy.current = true;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dir: 1 | -1 = finaleDir;
    const span = vw + CAR_W + 20;
    const driveSec = 2.2;

    setCfg({
      id: seq.current++,
      dir,
      dropPx: 0,
      stopLeft: dir === 1 ? -CAR_W - 10 : vw + 10,
      startX: 0,
      exitX: dir === 1 ? span : -span,
      tilt: 0,
      vh,
      driveSec,
      finale: true,
    });
    setPhase("drive");

    const t = setTimeout(() => setPhase("idle"), (driveSec + 2.4) * 1000);
    return () => clearTimeout(t);
  }, [successMode, reduce, finaleDir]);

  useEffect(
    () => () => {
      if (honkTimer.current) clearTimeout(honkTimer.current);
    },
    []
  );

  const honk = () => {
    bounce.start({
      y: [0, -9, 0, -4, 0],
      transition: { duration: 0.5, ease: "easeOut" },
    });
    setHonkCount((c) => c + 1);
    setBubble(true);
    if (honkTimer.current) clearTimeout(honkTimer.current);
    honkTimer.current = setTimeout(() => setBubble(false), 1100);
  };

  if (phase === "idle" || reduce || !cfg) return null;

  const { dir } = cfg;
  const moving = phase === "boxFall" || phase === "drive";
  const lifted = phase === "lifting" || phase === "drive";
  const hasBoxOnFork = phase === "lifting" || phase === "drive";
  const rearX = cfg.stopLeft + (dir === 1 ? 46 : 184);

  return (
    <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden" style={{ perspective: 1000 }}>
      {phase === "drive" && <TireTracks key={`t-${cfg.id}`} cfg={cfg} />}

      {phase === "drive" &&
        !cfg.finale &&
        [0, 0.14, 0.28].map((d, i) => (
          <GroundDust
            key={`dd-${cfg.id}-${i}`}
            x={rearX + (cfg.exitX / cfg.driveSec) * d}
            delay={d}
            bias={-dir}
            count={7}
            size={1.2}
          />
        ))}

      {phase === "boxFall" && (
        <>
          <motion.div
            key={`b-${cfg.id}`}
            className="absolute"
            style={{ left: cfg.dropPx - 25, bottom: "calc(6% + 16px)", transformStyle: "preserve-3d" }}
            initial={{ y: -(cfg.vh + 60), rotate: cfg.tilt, rotateX: 40, scale: 0.85 }}
            animate={{
              y: [-(cfg.vh + 60), 0, -9, 0],
              rotate: [cfg.tilt, cfg.tilt * 0.3, 0, 0],
              rotateX: [40, 10, -8, 0],
              scale: [0.85, 1.05, 0.98, 1],
            }}
            transition={{ duration: 1, times: [0, 0.7, 0.85, 1], ease: "easeIn" }}
          >
            <svg width="50" height="46" viewBox="6 58 50 46" fill="none">
              <BoxShape />
            </svg>
          </motion.div>
          <GroundDust
            key={`ld-${cfg.id}`}
            x={cfg.dropPx}
            delay={0.7}
            bias={0}
            count={10}
            size={1.4}
          />
        </>
      )}

      <motion.div
        key={`f-${cfg.id}`}
        className="absolute pointer-events-auto cursor-pointer"
        style={{ left: cfg.stopLeft, bottom: "6%", transformStyle: "preserve-3d" }}
        initial={{ x: cfg.startX, rotateY: dir === 1 ? -8 : 8 }}
        animate={{
          x: phase === "drive" ? cfg.exitX : 0,
          rotateY: phase === "drive" ? (dir === 1 ? 4 : -4) : 0,
        }}
        transition={
          phase === "drive"
            ? { duration: cfg.driveSec, ease: "linear" }
            : { duration: 1.8, ease: "easeOut" }
        }
        onClick={honk}
      >
        <motion.div animate={bounce} style={{ transformOrigin: "50% 100%" }}>
          <div className="relative" style={{ width: CAR_W, height: CAR_H }}>
            {/* เงาใต้รถ 3D */}
            <motion.div
              className="absolute left-1/2 -translate-x-1/2 rounded-[50%] bg-black/20 blur-md"
              style={{
                bottom: -6,
                width: CAR_W * 0.85,
                height: 18,
              }}
              animate={{
                scaleX: moving ? [1, 1.08, 1] : 1,
                opacity: moving ? [0.25, 0.18, 0.25] : 0.22,
              }}
              transition={{ duration: 0.6, repeat: moving ? Infinity : 0 }}
            />

            <div
              className="absolute inset-0"
              style={{ transform: dir === 1 ? "scaleX(-1)" : undefined }}
            >
              <motion.div
                className="absolute inset-0"
                initial={{ y: cfg.finale ? -34 : 0 }}
                animate={{ y: lifted ? -34 : 0 }}
                transition={{ duration: 0.9, ease: "easeInOut" }}
              >
                {hasBoxOnFork && (
                  <svg
                    width={CAR_W}
                    height={CAR_H}
                    viewBox={`0 0 ${CAR_W} ${CAR_H}`}
                    fill="none"
                    className="absolute inset-0"
                  >
                    <BoxShape />
                  </svg>
                )}
                <svg
                  width={CAR_W}
                  height={CAR_H}
                  viewBox={`0 0 ${CAR_W} ${CAR_H}`}
                  fill="none"
                  className="absolute inset-0"
                >
                  <rect x="58" y="48" width="6" height="62" rx="1" fill="#6b7280" />
                  <rect x="2" y="104" width="60" height="5" rx="1" fill="#ea580c" />
                  <rect x="2" y="109" width="60" height="2" fill="#c2410c" opacity="0.6" />
                </svg>
              </motion.div>

              <svg
                width={CAR_W}
                height={CAR_H}
                viewBox={`0 0 ${CAR_W} ${CAR_H}`}
                fill="none"
                className="absolute inset-0"
                style={{ overflow: "visible" }}
              >
                <rect x="66" y="10" width="8" height="98" rx="1.5" fill="#374151" />
                <rect x="68" y="18" width="4" height="30" fill="#6b7280" />

                <rect x="197" y="42" width="6" height="18" rx="1" fill="#374151" />
                <rect x="195.5" y="39.5" width="9" height="4" rx="1.5" fill="#1f2937" />

                <path
                  d="M104 58 V30 Q104 22 112 22 H168 Q176 22 179 32 L188 58"
                  fill="#9ca3af"
                  fillOpacity="0.25"
                  stroke="#6b7280"
                  strokeWidth="4"
                  strokeLinejoin="round"
                />
                <path d="M150 60 V42 Q150 38 154 38 H160 L166 60 Z" fill="#ea580c" />
                <path d="M122 62 L114 46" stroke="#6b7280" strokeWidth="3" strokeLinecap="round" />
                <ellipse cx="112" cy="44" rx="7" ry="2.5" fill="#6b7280" transform="rotate(-20 112 44)" />

                <path d="M76 72 H122 L132 58 H196 Q210 58 210 72 V102 H76 Z" fill="#f97316" />
                <path d="M76 90 H210 V102 H76 Z" fill="#ea580c" />
                <path d="M170 58 H196 Q210 58 210 72 V90 H170 Z" fill="#ea580c" opacity="0.55" />
                <rect x="204" y="68" width="5" height="8" rx="1.5" fill="#fbbf24" />

                <Wheel cx={98} cy={100} r={16} moving={moving} spin={dir === 1 ? -360 : 360} />
                <Wheel cx={184} cy={102} r={14} moving={moving} spin={dir === 1 ? -360 : 360} />

                <Beacon isDay={isDay} />
              </svg>
            </div>

            <ExhaustSmoke
              heavy={phase === "drive"}
              dir={dir}
              originX={dir === 1 ? CAR_W - 200 : 200}
            />

            {bubble && (
              <div
                className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
                style={{ bottom: CAR_H + 8 }}
              >
                <motion.div
                  key={honkCount}
                  initial={{ opacity: 0, scale: 0.4, y: 8 }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                    y: 0,
                    rotate: [0, -5, 5, -3, 0],
                  }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="whitespace-nowrap rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-bold text-orange-600 shadow-lg"
                >
                  📣 ปี๊น ปี๊น!
                </motion.div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ข้อความหลังเลิกงาน (นับถอยหลัง 10 วิ)                              */
/* ------------------------------------------------------------------ */

const AFTERWORK_START = new Date(2026, 9, 22, 0, 0, 0).getTime();
const AFTERWORK_KEY = "stock-req-afterwork-msg-v2";

function AfterWorkMessage({
  forceShow,
  onClose,
}: {
  forceShow: boolean;
  onClose: () => void;
}) {
  const lite = useLite();
  const [visible, setVisible] = useState(false);
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    if (forceShow) {
      setVisible(true);
      setCountdown(10);
      return;
    }

    if (Date.now() < AFTERWORK_START) return;

    const hour = new Date().getHours();
    if (hour < 18) return;

    let seen = false;
    try {
      seen = !!localStorage.getItem(AFTERWORK_KEY);
    } catch {
      return;
    }
    if (seen) return;

    const timer = setTimeout(() => {
      try {
        localStorage.setItem(AFTERWORK_KEY, String(Date.now()));
      } catch {}
      setVisible(true);
      setCountdown(10);
    }, 2500);

    return () => clearTimeout(timer);
  }, [forceShow]);

  useEffect(() => {
    if (!visible) return;

    if (countdown <= 0) {
      setVisible(false);
      onClose();
      return;
    }

    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [visible, countdown, onClose]);

  if (!visible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md"
    >
      <div
        className={`relative overflow-hidden rounded-2xl border border-emerald-200/80 shadow-2xl shadow-emerald-900/10 ${
          lite ? "bg-white" : "bg-white/95 backdrop-blur-md"
        }`}
      >
        <motion.div
          className="absolute top-0 left-0 h-1 bg-emerald-500"
          initial={{ width: "100%" }}
          animate={{ width: "0%" }}
          transition={{ duration: 10, ease: "linear" }}
        />

        <div className="px-5 py-5 text-center">
          <div className="text-2xl mb-2">🌙</div>
          <p className="text-slate-700 text-[15px] leading-relaxed font-medium">
            เลยเวลางานแล้วนะครับพี่ๆ
            <br />
            อย่าลืมพักผ่อนครับ
          </p>
          <p className="text-emerald-600 mt-2 text-lg tracking-wide">
            (＾◡＾)♡,Puff
          </p>

          <div className="mt-4 flex items-center justify-center gap-3">
            <span className="text-xs text-slate-400">
              ปิดใน {countdown} วินาที
            </span>
            <button
              onClick={() => {
                setVisible(false);
                onClose();
              }}
              className="text-xs px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition"
            >
              ปิดเลย
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Background                                                         */
/* ------------------------------------------------------------------ */

function Background({
  reduce,
  isDay,
  successMode,
  errorShake,
  calm,
}: {
  reduce: boolean;
  isDay: boolean;
  successMode: boolean;
  errorShake: boolean;
  calm: boolean;
}) {
  const lite = useLite();
  const visible = usePageVisible();
  // ทิศรถยกตอนฉากปิด ใช้ร่วมกับของที่บินเข้ากล่อง (สุ่มใหม่ทุกครั้งที่ล็อกอินสำเร็จ)
  const finaleDir = useMemo<1 | -1>(() => (Math.random() > 0.5 ? 1 : -1), [successMode]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 overflow-hidden"
      style={{ perspective: 1400, transformStyle: "preserve-3d" }}
    >
      {isDay ? (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-emerald-50/70" />
      ) : (
        <NightSky reduce={reduce} lite={lite} paused={!visible} />
      )}

      {/* ธีมคลังสินค้า – พื้นเบา ๆ เท่านั้น */}
      <WarehouseAmbient reduce={reduce} isDay={isDay} />

      {/* แสงนุ่มกลางฉากเท่านั้น (ไม่ลามขอบ) */}
      {isDay && !lite && (
        <motion.div
          className="absolute left-1/2 top-[35%] -translate-x-1/2 h-[20rem] w-[20rem] rounded-full bg-emerald-100/20 blur-3xl"
          animate={reduce ? undefined : { scale: [1, 1.08, 1], opacity: [0.35, 0.5, 0.35] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      <FallingItemsManager
        reduce={reduce}
        isDay={isDay}
        successMode={successMode}
        errorShake={errorShake}
        calm={calm}
        finaleDir={finaleDir}
      />

      <ForkliftEvent reduce={reduce} isDay={isDay} successMode={successMode} finaleDir={finaleDir} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Form Icons                                                         */
/* ------------------------------------------------------------------ */

const iconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const UserIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-3.6 3.6-6 8-6s8 2.4 8 6" />
  </svg>
);
const LockIcon = () => (
  <svg {...iconProps}>
    <rect x="4" y="11" width="16" height="9" rx="2.5" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);
const EyeIcon = () => (
  <svg {...iconProps}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const EyeOffIcon = () => (
  <svg {...iconProps}>
    <path d="M3 3l18 18" />
    <path d="M10.6 5.1A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.5 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7c1.6 0 3-.4 4.3-1" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </svg>
);
const WarnIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M12 3 2 20h20L12 3Z" />
    <path d="M12 10v4M12 17.5v.01" />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.2 } },
};

const itemVar: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
};

const inputClass =
  "w-full h-12 pl-11 rounded-xl border border-slate-200/80 bg-white/80 text-slate-800 placeholder-slate-400 " +
  "outline-none transition-all duration-200 " +
  "focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 " +
  "focus:shadow-[0_8px_28px_-8px_rgba(16,185,129,0.35)]";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [shake, setShake] = useState(false);
  const [errorShake, setErrorShake] = useState(false);
  const [successMode, setSuccessMode] = useState(false);
  const [calm, setCalm] = useState(false);
  const [forceDay, setForceDay] = useState<boolean | null>(null);
  const [showAfterWorkMsg, setShowAfterWorkMsg] = useState(false);

  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reduce = !!useReducedMotion();
  const lite = useLiteMode();
  const isDay = useIsDaytime(forceDay);

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [3.5, -3.5]), {
    stiffness: 120,
    damping: 18,
  });
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-3.5, 3.5]), {
    stiffness: 120,
    damping: 18,
  });

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(REMEMBER_KEY);
    } catch {
      /* ไม่มีสิทธิ์เข้าถึง storage → ข้าม */
    }

    if (saved) {
      setUsername(saved);
      setRememberMe(true);
      passwordRef.current?.focus();
    } else {
      usernameRef.current?.focus();
    }
  }, []);

  useEffect(
    () => () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    },
    []
  );

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (reduce || e.pointerType === "touch") return;
    mx.set(e.clientX / window.innerWidth - 0.5);
    my.set(e.clientY / window.innerHeight - 0.5);
  }

  function syncCapsLock(e: React.KeyboardEvent<HTMLInputElement>) {
    setCapsLock(e.getModifierState("CapsLock"));
  }

  function handleRememberChange(checked: boolean) {
    setRememberMe(checked);
    if (!checked) {
      try {
        localStorage.removeItem(REMEMBER_KEY);
      } catch {
        /* ignore */
      }
    }
  }

  function persistUsername() {
    try {
      if (rememberMe && username.trim()) {
        localStorage.setItem(REMEMBER_KEY, username.trim());
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }
    } catch {
      /* ignore */
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (submitting.current || redirectTimer.current) return;
    submitting.current = true;

    setLoading(true);
    try {
      const res = await signIn("credentials", {
        username,
        password,
        redirect: false,
      });

      if (res?.error) {
        toast.error(
          res.error === "CredentialsSignin"
            ? "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"
            : "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง"
        );
        setShake(true);
        setErrorShake(true);
        setTimeout(() => setShake(false), 500);
        setTimeout(() => setErrorShake(false), 700);
        setLoading(false);
        submitting.current = false;
        return;
      }

      persistUsername();
      toast.success("เข้าสู่ระบบสำเร็จ");
      setSuccessMode(true);

      redirectTimer.current = setTimeout(
        () => {
          window.location.assign("/staff/requisition");
        },
        reduce ? 500 : 2600
      );
    } catch {
      toast.error("เกิดข้อผิดพลาด กรุณาลองใหม่");
      setLoading(false);
      submitting.current = false;
    }
  }

  return (
    <LiteContext.Provider value={lite}>
      <div
        className="relative min-h-screen flex items-center justify-center px-4 py-10 overflow-hidden"
        onPointerMove={handlePointerMove}
        style={{ perspective: 1600 }}
      >
        <Background
          reduce={reduce}
          isDay={isDay}
          successMode={successMode}
          errorShake={errorShake}
          calm={calm}
        />
        <PageTransitionOverlay
          show={loading && !successMode}
          label="กำลังเข้าสู่ระบบ..."
        />

        {SHOW_TEST_BUTTONS && (
          <div className="fixed top-4 right-4 z-50 flex flex-wrap gap-2 justify-end max-w-[280px]">
            <button
              onClick={() => setForceDay(true)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium shadow transition ${forceDay === true
                  ? "bg-emerald-500 text-white"
                  : "bg-white/90 text-slate-700 hover:bg-white"
                }`}
            >
              ☀️ กลางวัน
            </button>
            <button
              onClick={() => setForceDay(false)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium shadow transition ${forceDay === false
                  ? "bg-slate-600 text-white"
                  : "bg-white/90 text-slate-700 hover:bg-white"
                }`}
            >
              🌙 กลางคืน
            </button>
            <button
              onClick={() => setForceDay(null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium shadow transition ${forceDay === null
                  ? "bg-blue-500 text-white"
                  : "bg-white/90 text-slate-700 hover:bg-white"
                }`}
            >
              Auto
            </button>
            <button
              onClick={() => setShowAfterWorkMsg(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium shadow bg-amber-100 text-amber-800 hover:bg-amber-200 transition"
            >
              💬 จำลองข้อความ
            </button>
          </div>
        )}

        <AfterWorkMessage
          forceShow={showAfterWorkMsg}
          onClose={() => setShowAfterWorkMsg(false)}
        />

        <div className="relative w-full max-w-md" style={{ perspective: 1400 }}>
          {!lite && (
            <div
              aria-hidden
              className="absolute -inset-5 -z-10 rounded-[2.5rem] bg-gradient-to-br from-emerald-200/20 via-transparent to-teal-200/20 blur-2xl"
            />
          )}

          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={
              successMode
                ? { opacity: 0, scale: 0.7, y: -50, rotateX: 12, filter: "blur(10px)" }
                : shake
                  ? {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    x: [0, -8, 7, -6, 4, -2, 0],
                    rotate: [0, -1.2, 1, -0.8, 0.5, 0],
                  }
                  : { opacity: 1, y: 0, scale: 1, x: 0, rotate: 0 }
            }
            transition={
              successMode
                ? { duration: 0.95, ease: "easeInOut" }
                : shake
                  ? { duration: 0.5, ease: "easeOut" }
                  : { duration: 0.7, ease: EASE }
            }
            style={
              reduce || successMode || lite
                ? undefined
                : { rotateX, rotateY, transformPerspective: 1400, transformStyle: "preserve-3d" }
            }
            className={`relative rounded-3xl border border-white/80 p-8 sm:p-10 shadow-[0_25px_60px_-15px_rgba(16,185,129,0.18),0_8px_24px_-8px_rgba(0,0,0,0.08)] ring-1 ring-inset ring-white/50 ${
              lite ? "bg-white/95" : "bg-white/80 backdrop-blur-xl"
            }`}
          >
            <motion.div variants={container} initial="hidden" animate="show">
              <motion.div variants={itemVar} className="mb-7 text-center">
                <motion.div
                  className="mx-auto mb-4 flex justify-center"
                  animate={
                    reduce || successMode ? undefined : { y: [0, -6, 0] }
                  }
                  transition={{
                    duration: 5,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  <Image
                    src="/logo.svg"
                    alt="Logo"
                    width={72}
                    height={72}
                    priority
                    className="drop-shadow-md"
                  />
                </motion.div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-800">
                  ระบบเบิกสินค้าคงคลัง
                </h1>
                <p className="mt-1.5 text-sm text-slate-500">
                  Stock Requisition System
                </p>
              </motion.div>

              <form
                onSubmit={handleSubmit}
                className="space-y-5"
                onFocusCapture={() => setCalm(true)}
                onBlurCapture={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setCalm(false);
                }}
              >
                <motion.div variants={itemVar}>
                  <label
                    htmlFor="username"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Username
                  </label>
                  <div className="group relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500">
                      <UserIcon />
                    </span>
                    <input
                      ref={usernameRef}
                      id="username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className={`${inputClass} pr-4`}
                      placeholder="ชื่อผู้ใช้"
                      required
                      autoComplete="username"
                    />
                  </div>
                </motion.div>

                <motion.div variants={itemVar}>
                  <label
                    htmlFor="password"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Password
                  </label>
                  <div className="group relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500">
                      <LockIcon />
                    </span>
                    <input
                      ref={passwordRef}
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={syncCapsLock}
                      onKeyUp={syncCapsLock}
                      onBlur={() => setCapsLock(false)}
                      className={`${inputClass} pr-12`}
                      placeholder="รหัสผ่าน"
                      required
                      autoComplete="current-password"
                      aria-describedby="caps-warning"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={
                        showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"
                      }
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                    >
                      {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>

                  <div id="caps-warning" role="status" aria-live="polite">
                    {capsLock && (
                      <motion.p
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-amber-600"
                      >
                        <WarnIcon />
                        Caps Lock เปิดอยู่ รหัสผ่านอาจพิมพ์ผิดตัวพิมพ์ใหญ่/เล็ก
                      </motion.p>
                    )}
                  </div>
                </motion.div>

                <motion.div variants={itemVar} className="-mt-1">
                  <label className="inline-flex cursor-pointer select-none items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => handleRememberChange(e.target.checked)}
                      className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-emerald-600"
                    />
                    จำฉันไว้
                  </label>
                </motion.div>

                <motion.div variants={itemVar} className="pt-1">
                  <motion.button
                    type="submit"
                    disabled={loading}
                    whileHover={loading ? undefined : { scale: 1.015 }}
                    whileTap={loading ? undefined : { scale: 0.985 }}
                    className="relative flex h-12 w-full items-center justify-center gap-2.5 overflow-hidden rounded-xl
                               bg-emerald-600 font-semibold text-white shadow-md shadow-emerald-600/25
                               transition-all duration-200 hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-500/30
                               focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/30
                               disabled:cursor-not-allowed disabled:opacity-75"
                  >
                    {loading && !successMode && (
                      <svg
                        className="h-5 w-5 animate-spin"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle
                          cx="12"
                          cy="12"
                          r="9"
                          stroke="currentColor"
                          strokeOpacity="0.3"
                          strokeWidth="3"
                        />
                        <path
                          d="M21 12a9 9 0 0 0-9-9"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                        />
                      </svg>
                    )}
                    <span>
                      {successMode
                        ? "ยินดีต้อนรับ..."
                        : loading
                          ? "กำลังเข้าสู่ระบบ..."
                          : "เข้าสู่ระบบ"}
                    </span>
                  </motion.button>
                </motion.div>
              </form>
            </motion.div>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: successMode ? 0 : 1 }}
            transition={{ delay: 0.8 }}
            className={`mt-6 text-center text-sm font-medium ${
              isDay ? "text-slate-500" : "text-violet-200/90"
            }`}
          >
            ติดต่อผู้ดูแลระบบหากลืมรหัสผ่าน
          </motion.p>
        </div>
      </div>
    </LiteContext.Provider>
  );
}