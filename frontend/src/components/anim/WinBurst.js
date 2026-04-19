import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { motion } from "framer-motion";
import { fmtUSD } from "../../lib/format";
export default function WinBurst({ ev }) {
    return (_jsxs(motion.div, { className: "absolute inset-0 flex items-center justify-center", initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, children: [_jsx(motion.div, { className: "absolute", initial: { scale: 0.5, opacity: 0 }, animate: { scale: [0.6, 1.1, 2.2], opacity: [0.6, 0.35, 0] }, transition: { duration: 2.2, ease: "easeOut" }, style: {
                    width: 220, height: 220, borderRadius: "50%",
                    background: "radial-gradient(circle, rgba(52,211,153,0.7) 0%, rgba(52,211,153,0.0) 70%)",
                    filter: "blur(4px)",
                } }), _jsx(motion.div, { className: "text-bull font-display font-bold text-5xl tracking-tight drop-shadow-[0_0_16px_rgba(52,211,153,0.7)]", initial: { y: 20, opacity: 0, scale: 0.8 }, animate: { y: -30, opacity: [0, 1, 1, 0], scale: [0.9, 1.05, 1] }, transition: { duration: 2.2, times: [0, 0.15, 0.75, 1] }, children: fmtUSD(ev.pnl ?? 0, 2) })] }));
}
