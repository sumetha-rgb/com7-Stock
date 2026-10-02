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
  rotateStart: number;
  breakable: boolean;
};

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

function createItem(id: number, isDay: boolean): FallingItem {
  const pool = isDay ? DAY_TYPES : NIGHT_TYPES;
  const type = pool[Math.floor(Math.random() * pool.length)];
  const breakable =
    ["bottle", "box", "smallbox", "battery"].includes(type) &&
    Math.random() > 0.45;

  return {
    id,
    x: 5 + Math.random() * 90,
    type,
    delay: Math.random() * 0.4,
    duration: 3.4 + Math.random() * 1.5,
    rotateStart: (Math.random() - 0.5) * 50,
    breakable,
  };
}

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */

function BoxIcon({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5v-9z"
        fill="#10b981"
        fillOpacity="0.18"
        stroke="#059669"
        strokeWidth="1.5"
      />
      <path
        d="M3 7.5L12 12l9-4.5M12 12v9"
        stroke="#047857"
        strokeWidth="1.4"
      />
    </svg>
  );
}
function ShirtIcon({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M6 4l-3 3v3h3v10h12V10h3V7l-3-3H6z"
        fill="#10b981"
        fillOpacity="0.15"
        stroke="#059669"
        strokeWidth="1.5"
      />
      <path d="M9 4v3h6V4" stroke="#047857" strokeWidth="1.3" />
    </svg>
  );
}
function ToolIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
        fill="#10b981"
        fillOpacity="0.15"
        stroke="#059669"
        strokeWidth="1.4"
      />
    </svg>
  );
}
function HelmetIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 4C8 4 5 8 5 12v2h14v-2c0-4-3-8-7-8z"
        fill="#10b981"
        fillOpacity="0.18"
        stroke="#059669"
        strokeWidth="1.4"
      />
      <path
        d="M5 14h14v2a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-2z"
        fill="#059669"
        fillOpacity="0.25"
        stroke="#047857"
        strokeWidth="1.2"
      />
    </svg>
  );
}
function BottleIcon({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M9 2h6v3l2 3v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V8l2-3V2z"
        fill="#10b981"
        fillOpacity="0.15"
        stroke="#059669"
        strokeWidth="1.4"
      />
      <path
        d="M9 2h6"
        stroke="#047857"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
function LaptopIcon({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect
        x="3"
        y="5"
        width="18"
        height="12"
        rx="1.5"
        fill="#10b981"
        fillOpacity="0.15"
        stroke="#059669"
        strokeWidth="1.4"
      />
      <path
        d="M2 17h20v1.5a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 18.5V17z"
        fill="#059669"
        fillOpacity="0.25"
        stroke="#047857"
        strokeWidth="1.2"
      />
    </svg>
  );
}
function GlovesIcon({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M8 4v6H5.5A1.5 1.5 0 0 0 4 11.5V18a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-6.5A1.5 1.5 0 0 0 14.5 10H12V4a2 2 0 0 0-4 0z"
        fill="#10b981"
        fillOpacity="0.15"
        stroke="#059669"
        strokeWidth="1.3"
      />
    </svg>
  );
}
function SmallBoxIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect
        x="5"
        y="8"
        width="14"
        height="11"
        rx="1.5"
        fill="#10b981"
        fillOpacity="0.18"
        stroke="#059669"
        strokeWidth="1.4"
      />
      <path d="M5 11h14" stroke="#047857" strokeWidth="1.2" />
      <path
        d="M9 8V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V8"
        stroke="#059669"
        strokeWidth="1.2"
      />
    </svg>
  );
}
function FlashlightIcon({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M9 10h6v10a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V10z"
        fill="#10b981"
        fillOpacity="0.18"
        stroke="#059669"
        strokeWidth="1.4"
      />
      <path d="M9 10V7l1.5-3h3L16 7v3" stroke="#047857" strokeWidth="1.4" />
      <path
        d="M12 14v3"
        stroke="#059669"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
function BatteryIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect
        x="6"
        y="7"
        width="12"
        height="14"
        rx="1.5"
        fill="#10b981"
        fillOpacity="0.18"
        stroke="#059669"
        strokeWidth="1.4"
      />
      <path d="M10 7V5h4v2" stroke="#047857" strokeWidth="1.4" />
      <path
        d="M9 12h6M9 15h4"
        stroke="#059669"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
function RadioIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect
        x="3"
        y="8"
        width="18"
        height="12"
        rx="2"
        fill="#10b981"
        fillOpacity="0.15"
        stroke="#059669"
        strokeWidth="1.4"
      />
      <circle cx="8" cy="14" r="2.5" stroke="#047857" strokeWidth="1.3" />
      <path
        d="M14 12h4M14 15h3"
        stroke="#059669"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path d="M7 8V5l8-2" stroke="#047857" strokeWidth="1.3" />
    </svg>
  );
}
function ThermosIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M9 6h6v14a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V6z"
        fill="#10b981"
        fillOpacity="0.15"
        stroke="#059669"
        strokeWidth="1.4"
      />
      <path
        d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"
        stroke="#047857"
        strokeWidth="1.3"
      />
      <path d="M8 9h8" stroke="#059669" strokeWidth="1.2" />
    </svg>
  );
}

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
/*  Dust + Fragments                                                   */
/* ------------------------------------------------------------------ */

function DustParticles({ x }: { x: number }) {
  const particles = Array.from({ length: 9 }).map((_, i) => ({
    id: i,
    angle: (i / 9) * Math.PI * 2 + (Math.random() - 0.5) * 0.7,
    dist: 16 + Math.random() * 30,
    size: 2.2 + Math.random() * 3.2,
    delay: Math.random() * 0.07,
  }));

  return (
    <>
      {particles.map((p) => (
        <motion.span
          key={p.id}
          className="absolute rounded-full bg-emerald-500/60"
          style={{
            left: `${x}%`,
            bottom: "2%",
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

function Fragments({ x }: { x: number }) {
  const pieces = Array.from({ length: 6 }).map((_, i) => ({
    id: i,
    angle: (i / 6) * Math.PI * 2 + (Math.random() - 0.5),
    dist: 20 + Math.random() * 35,
    rot: (Math.random() - 0.5) * 180,
    size: 6 + Math.random() * 8,
    delay: Math.random() * 0.06,
  }));

  return (
    <>
      {pieces.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-sm bg-emerald-500/50 border border-emerald-400/60"
          style={{
            left: `${x}%`,
            bottom: "2.5%",
            width: p.size,
            height: p.size * 0.7,
            x: "-50%",
          }}
          initial={{ x: "-50%", y: 0, opacity: 0.95, rotate: 0, scale: 1 }}
          animate={{
            x: `calc(-50% + ${Math.cos(p.angle) * p.dist}px)`,
            y: -Math.abs(Math.sin(p.angle)) * p.dist * 0.8 - 10,
            opacity: 0,
            rotate: p.rot,
            scale: 0.3,
          }}
          transition={{ duration: 0.65, delay: p.delay, ease: "easeOut" }}
        />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Falling Item                                                       */
/* ------------------------------------------------------------------ */

function FallingItemView({
  item,
  onComplete,
  reduce,
  successMode,
  errorShake,
}: {
  item: FallingItem;
  onComplete: (id: number) => void;
  reduce: boolean;
  successMode: boolean;
  errorShake: boolean;
}) {
  const lite = useLite();
  const Icon = IconMap[item.type];
  const [phase, setPhase] = useState<
    "falling" | "bounce" | "break" | "impact" | "flyup" | "done"
  >("falling");

  useEffect(() => {
    if (successMode && (phase === "falling" || phase === "bounce")) {
      setPhase("flyup");
    }
  }, [successMode, phase]);

  const handleFallComplete = () => {
    if (reduce || successMode) {
      onComplete(item.id);
      return;
    }
    if (item.breakable) setPhase("break");
    else setPhase("bounce");
  };

  useEffect(() => {
    if (phase !== "bounce" && phase !== "break") return;
    const t = setTimeout(
      () => setPhase("impact"),
      phase === "break" ? 180 : 280
    );
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "impact") return;
    const t = setTimeout(() => {
      setPhase("done");
      onComplete(item.id);
    }, 880);
    return () => clearTimeout(t);
  }, [phase, item.id, onComplete]);

  useEffect(() => {
    if (phase !== "flyup") return;
    const t = setTimeout(() => {
      setPhase("done");
      onComplete(item.id);
    }, 900);
    return () => clearTimeout(t);
  }, [phase, item.id, onComplete]);

  if (phase === "done") return null;

  return (
    <>
      {phase === "falling" && !successMode && (
        <motion.div
          className={`absolute pointer-events-none z-0 rounded-[50%] bg-emerald-800/25 ${
            lite ? "" : "blur-[2px]"
          }`}
          style={{
            left: `${item.x}%`,
            bottom: "1.8%",
            width: 36,
            height: 10,
            x: "-50%",
          }}
          initial={{ scale: 0.3, opacity: 0 }}
          animate={{ scale: 1.1, opacity: 0.5 }}
          transition={{
            duration: item.duration * 0.85,
            delay: item.delay,
            ease: "easeIn",
          }}
        />
      )}

      {(phase === "falling" || phase === "bounce" || phase === "flyup") && (
        <motion.div
          className="absolute pointer-events-none z-10"
          style={{
            left: `${item.x}%`,
            top: phase === "flyup" ? undefined : -50,
          }}
          initial={{ y: 0, rotate: item.rotateStart, opacity: 0.95 }}
          animate={
            errorShake
              ? {
                x: [0, -7, 6, -5, 4, -3, 0],
                rotate: [
                  item.rotateStart,
                  item.rotateStart - 12,
                  item.rotateStart + 10,
                  item.rotateStart - 8,
                  item.rotateStart + 6,
                  item.rotateStart,
                ],
              }
              : phase === "falling"
                ? {
                  y: "100vh",
                  rotate:
                    item.rotateStart + (Math.random() > 0.5 ? 340 : -300),
                }
                : phase === "bounce"
                  ? {
                    y: ["100vh", "97.2vh", "100vh"],
                    rotate: item.rotateStart + 360,
                  }
                  : {
                    y: -200,
                    opacity: 0,
                    rotate: item.rotateStart + 120,
                    scale: 0.6,
                  }
          }
          transition={
            errorShake
              ? { duration: 0.5, ease: "easeInOut" }
              : phase === "falling"
                ? {
                  duration: item.duration,
                  delay: item.delay,
                  ease: [0.22, 0.1, 0.25, 1],
                }
                : phase === "bounce"
                  ? { duration: 0.28, ease: "easeOut" }
                  : { duration: 0.85, ease: "easeIn" }
          }
          onAnimationComplete={() => {
            if (phase === "falling" && !errorShake) handleFallComplete();
          }}
        >
          <Icon />
        </motion.div>
      )}

      {phase === "break" && <Fragments x={item.x} />}

      {phase === "impact" && (
        <motion.div
          className="absolute pointer-events-none z-0"
          style={{ left: `${item.x}%`, bottom: "1.5%", x: "-50%" }}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
        >
          {/* แสงฟุ้ง (blur หนัก) ข้ามในโหมดเบา */}
          {!lite && (
            <motion.div
              className="absolute rounded-full bg-emerald-400/50 blur-md"
              style={{
                width: 80,
                height: 80,
                left: "50%",
                top: -30,
                x: "-50%",
              }}
              initial={{ scale: 0.3, opacity: 0.9 }}
              animate={{ scale: 1.8, opacity: 0 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
            />
          )}
          <DustParticles x={item.x} />
          <motion.div
            className="absolute rounded-full border-2 border-emerald-400/50"
            style={{
              width: 64,
              height: 18,
              left: "50%",
              top: 4,
              x: "-50%",
            }}
            initial={{ scale: 0.3, opacity: 0.8 }}
            animate={{ scale: 1.9, opacity: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          />
          <svg
            width="100"
            height="36"
            viewBox="0 0 100 36"
            className="absolute"
            style={{ left: "50%", x: "-50%", top: -6 }}
          >
            <motion.path
              d="M8 20 Q28 6 50 18 Q72 30 92 14"
              fill="none"
              stroke="#047857"
              strokeWidth="2.4"
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0.9 }}
              animate={{ pathLength: 1, opacity: 0.6 }}
              transition={{ duration: 0.35 }}
            />
            <motion.path
              d="M22 16 Q35 28 48 20"
              fill="none"
              stroke="#059669"
              strokeWidth="1.7"
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0.8 }}
              animate={{ pathLength: 1, opacity: 0.45 }}
              transition={{ duration: 0.3, delay: 0.05 }}
            />
            <motion.path
              d="M55 22 Q68 10 82 19"
              fill="none"
              stroke="#10b981"
              strokeWidth="1.5"
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0.7 }}
              animate={{ pathLength: 1, opacity: 0.4 }}
              transition={{ duration: 0.28, delay: 0.08 }}
            />
          </svg>
        </motion.div>
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
}: {
  reduce: boolean;
  isDay: boolean;
  successMode: boolean;
  errorShake: boolean;
}) {
  const lite = useLite();
  const visible = usePageVisible();
  const [items, setItems] = useState<FallingItem[]>([]);

  const maxItems = lite ? 4 : 7;
  const initialCount = lite ? 2 : 3;
  const spawnMs = lite ? 2200 : 1500;

  useEffect(() => {
    if (reduce || successMode) return;

    // แท็บถูกซ่อน → เคลียร์ของที่ค้าง ไม่เปิด interval
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

    const interval = setInterval(() => {
      setItems((prev) => {
        if (prev.length >= maxItems) return prev;
        return [...prev, createItem(idCounter++, isDay)];
      });
    }, spawnMs);

    return () => clearInterval(interval);
  }, [reduce, isDay, successMode, visible, maxItems, initialCount, spawnMs]);

  const removeItem = useCallback((id: number) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  if (reduce) return null;

  // fi-night: ให้ NightSky.tsx รีสีของที่ตกลงมา (เขียวเข้ม → ม่วงอ่อนเรืองแสง) เฉพาะกลางคืน
  return (
    <div className={isDay ? "fi-layer" : "fi-layer fi-night"}>
      {items.map((item) => (
        <FallingItemView
          key={item.id}
          item={item}
          onComplete={removeItem}
          reduce={reduce}
          successMode={successMode}
          errorShake={errorShake}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Forklift: กล่องสุ่มตก + รถมาจากซ้าย/ขวา + ฝุ่น + ไฟหมุน + ฉากปิดท้าย */
/* ------------------------------------------------------------------ */

type ForkPhase = "idle" | "boxFall" | "lifting" | "drive";

type ForkCfg = {
  id: number;
  dir: 1 | -1; // 1 = รถหันขวา (มาจากซ้าย), -1 = รถหันซ้าย (มาจากขวา)
  dropPx: number;
  stopLeft: number;
  startX: number;
  exitX: number;
  tilt: number;
  vh: number;
  driveSec: number;
  finale: boolean; // true = ฉากปิดท้ายตอนล็อกอินสำเร็จ (บรรทุกกล่องมาแล้ว)
};

const CAR_W = 230;
const CAR_H = 120;

/* ---------- ล้อ ---------- */
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

/* ---------- กล่อง ---------- */
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

/* ---------- ไฟหมุนบนหลังคา (กะพริบสลับซ้าย/ขวา กลางคืนสว่างกว่า) ---------- */
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

/* ---------- ฝุ่นฟุ้งที่พื้น (ใช้ทั้งตอนกล่องตกและตอนล้อออกตัว) ---------- */
function GroundDust({
  x,
  delay,
  bias,
  count,
  size,
}: {
  x: number;
  delay: number;
  bias: number; // 0 = กระจายสองข้าง, ±1 = พุ่งไปทางนั้น
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

/* ---------- ควันท่อไอเสีย ---------- */
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

/* ---------- รอยยางบนพื้น ---------- */
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

/* ---------- ตัวหลัก ---------- */
function ForkliftEvent({
  reduce,
  isDay,
  successMode,
}: {
  reduce: boolean;
  isDay: boolean;
  successMode: boolean;
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

  /* ----- รอบปกติ: คันต่อไปมาหลังคันก่อนออกจอ 5-10 วินาที (หยุดเมื่อแท็บถูกซ่อน) ----- */
  useEffect(() => {
    if (reduce || successMode) return;

    // แท็บถูกซ่อน → ยกเลิกรอบที่กำลังเล่น ไม่ตั้ง timer ใหม่
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
      const carExitMs = 3400 + driveSec * 1000; // รถขับพ้นจอ
      later(() => {
        setPhase("idle");
        busy.current = false;
      }, carExitMs + 2300);

      // คันต่อไปมาหลังรถคันนี้ออกจากจอไป 5-10 วินาที (ทิศทาง/ตำแหน่งกล่องสุ่มใหม่)
      later(startSequence, carExitMs + 5000 + Math.random() * 5000);
    };

    later(startSequence, 2000); // เปิดหน้าเว็บมา 2 วินาที → รถ+กล่องมาคันแรกทันที

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      busy.current = false;
    };
  }, [reduce, successMode, visible]);

  /* ----- ฉากปิดท้าย: ล็อกอินสำเร็จ → รถยกกล่องวิ่งตัดจอ ----- */
  useEffect(() => {
    if (!successMode || reduce) return;

    timers.current.forEach(clearTimeout);
    timers.current = [];
    busy.current = true;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dir: 1 | -1 = Math.random() > 0.5 ? 1 : -1;
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
  }, [successMode, reduce]);

  useEffect(
    () => () => {
      if (honkTimer.current) clearTimeout(honkTimer.current);
    },
    []
  );

  /* ----- คลิกรถ → บีบแตร + รถเด้ง ----- */
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
  const rearX = cfg.stopLeft + (dir === 1 ? 46 : 184); // ตำแหน่งล้อหลังบนพื้น

  return (
    <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
      {/* รอยยาง */}
      {phase === "drive" && <TireTracks key={`t-${cfg.id}`} cfg={cfg} />}

      {/* ฝุ่นที่ล้อหลังตอนออกตัว (ทิ้งไว้ที่พื้นตามความเร็วรถ) */}
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

      {/* กล่องตกที่ตำแหน่งสุ่ม + ฝุ่นตอนกระแทกพื้น */}
      {phase === "boxFall" && (
        <>
          <motion.div
            key={`b-${cfg.id}`}
            className="absolute"
            style={{ left: cfg.dropPx - 25, bottom: "calc(6% + 16px)" }}
            initial={{ y: -(cfg.vh + 60), rotate: cfg.tilt }}
            animate={{
              y: [-(cfg.vh + 60), 0, -9, 0],
              rotate: [cfg.tilt, cfg.tilt * 0.3, 0, 0],
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

      {/* รถยก (คลิกได้) */}
      <motion.div
        key={`f-${cfg.id}`}
        className="absolute pointer-events-auto cursor-pointer"
        style={{ left: cfg.stopLeft, bottom: "6%" }}
        initial={{ x: cfg.startX }}
        animate={{ x: phase === "drive" ? cfg.exitX : 0 }}
        transition={
          phase === "drive"
            ? { duration: cfg.driveSec, ease: "linear" }
            : { duration: 1.8, ease: "easeOut" }
        }
        onClick={honk}
      >
        <motion.div animate={bounce} style={{ transformOrigin: "50% 100%" }}>
          <div className="relative" style={{ width: CAR_W, height: CAR_H }}>
            <div
              className="absolute inset-0"
              style={{ transform: dir === 1 ? "scaleX(-1)" : undefined }}
            >
              {/* งา + กล่อง */}
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

              {/* ตัวรถ */}
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

                {/* ไฟหมุนบนหลังคา */}
                <Beacon isDay={isDay} />
              </svg>
            </div>

            <ExhaustSmoke
              heavy={phase === "drive"}
              dir={dir}
              originX={dir === 1 ? CAR_W - 200 : 200}
            />

            {/* ลูกโป่ง "ปี๊น!" ตอนคลิก */}
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

// 22 ต.ค. 2569 พ.ศ. = 2026 ค.ศ. (เดือนใน JS นับจาก 0 → ตุลาคม = 9)
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

    // เริ่มแสดงตั้งแต่ 22 ต.ค. 2569 (พ.ศ.) = 2026-10-22 เวลา 00:00 เป็นต้นไป
    if (Date.now() < AFTERWORK_START) return;

    const hour = new Date().getHours();
    if (hour < 18) return;

    // แสดงครั้งเดียวต่อผู้ใช้/เบราว์เซอร์ แล้วไม่แสดงอีกเลย
    let seen = false;
    try {
      seen = !!localStorage.getItem(AFTERWORK_KEY);
    } catch {
      // อ่าน storage ไม่ได้ → ไม่แสดง (กันเด้งซ้ำทุกครั้ง)
      return;
    }
    if (seen) return;

    const timer = setTimeout(() => {
      // บันทึกตอนแสดงทันที: ต่อให้ปิดแท็บก่อนครบ 10 วิ ก็ไม่เด้งอีก
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
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md"
    >
      <div
        className={`relative overflow-hidden rounded-2xl border border-emerald-200/80 shadow-2xl shadow-emerald-900/10 ${
          lite ? "bg-white" : "bg-white/95 backdrop-blur-md"
        }`}
      >
        {/* แถบ progress */}
        <motion.div
          className="absolute top-0 left-0 h-1 bg-emerald-500"
          initial={{ width: "100%" }}
          animate={{ width: "0%" }}
          transition={{ duration: 10, ease: "linear" }}
        />

        <div className="px-5 py-5 text-center">
          <div className="text-2xl mb-2">🌙</div>
          <p className="text-slate-700 text-[15px] leading-relaxed font-medium">
            เลยเวลางานนะครับพี่ๆ
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
}: {
  reduce: boolean;
  isDay: boolean;
  successMode: boolean;
  errorShake: boolean;
}) {
  const lite = useLite();
  const visible = usePageVisible();

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      {isDay ? (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-emerald-50/70" />
      ) : (
        <NightSky reduce={reduce} lite={lite} paused={!visible} />
      )}

      {/* ลูกบอลสีฟุ้ง (blur-3xl หนักมาก) เฉพาะกลางวัน และข้ามในโหมดเบา */}
      {isDay && !lite && (
        <>
          <motion.div
            className="absolute -top-32 -left-28 h-[26rem] w-[26rem] rounded-full bg-emerald-200/25 blur-3xl"
            animate={reduce ? undefined : { x: [0, 50, 0], y: [0, 30, 0] }}
            transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute top-1/3 -right-32 h-[24rem] w-[24rem] rounded-full bg-teal-100/30 blur-3xl"
            animate={reduce ? undefined : { x: [0, -40, 0], y: [0, 40, 0] }}
            transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
          />
        </>
      )}

      <FallingItemsManager
        reduce={reduce}
        isDay={isDay}
        successMode={successMode}
        errorShake={errorShake}
      />

      <ForkliftEvent reduce={reduce} isDay={isDay} successMode={successMode} />
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
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [2, -2]), {
    stiffness: 120,
    damping: 18,
  });
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-2, 2]), {
    stiffness: 120,
    damping: 18,
  });

  /* ----- โหลด username ที่จำไว้ + โฟกัสช่องที่เหมาะสม ----- */
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

  /* ----- เคลียร์ timer redirect ตอน unmount ----- */
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

  /** ตรวจ Caps Lock จากคีย์ที่กด (ใช้ทั้ง keydown/keyup กันพลาดบน Mac) */
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

    // กันส่งซ้ำ (กด Enter รัว / คลิกซ้ำ) และกัน redirect ซ้อน
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

      // ผู้ใช้ลดการเคลื่อนไหว → ไม่มีฉากปิดท้าย ไม่ต้องรอนาน
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
      >
        <Background
          reduce={reduce}
          isDay={isDay}
          successMode={successMode}
          errorShake={errorShake}
        />
        <PageTransitionOverlay
          show={loading && !successMode}
          label="กำลังเข้าสู่ระบบ..."
        />

        {/* ปุ่มทดสอบ (เปิด/ปิดที่ SHOW_TEST_BUTTONS ด้านบนไฟล์) */}
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

        {/* ข้อความหลังเลิกงาน */}
        <AfterWorkMessage
          forceShow={showAfterWorkMsg}
          onClose={() => setShowAfterWorkMsg(false)}
        />

        <div className="relative w-full max-w-md" style={{ perspective: 1200 }}>
          {/* แสงฟุ้งหลังการ์ด (blur-2xl) ข้ามในโหมดเบา */}
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
                ? { opacity: 0, scale: 0.75, y: -40, filter: "blur(8px)" }
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
                ? { duration: 0.9, ease: "easeInOut" }
                : shake
                  ? { duration: 0.5, ease: "easeOut" }
                  : { duration: 0.7, ease: EASE }
            }
            style={
              reduce || successMode || lite
                ? undefined
                : { rotateX, rotateY, transformPerspective: 1200 }
            }
            className={`relative rounded-3xl border border-white/80 p-8 sm:p-10 shadow-[0_25px_60px_-15px_rgba(16,185,129,0.16)] ring-1 ring-inset ring-white/50 ${
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

              <form onSubmit={handleSubmit} className="space-y-5">
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

                  {/* เตือน Caps Lock */}
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

                {/* จำฉันไว้ */}
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