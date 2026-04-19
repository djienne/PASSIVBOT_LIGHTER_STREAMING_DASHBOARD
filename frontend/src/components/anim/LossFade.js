import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { motion } from "framer-motion";
import { fmtUSD } from "../../lib/format";
export default function LossFade({ ev }) {
    return (_jsxs(motion.div, { className: "absolute inset-0 flex items-center justify-center", initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, children: [_jsx(motion.div, { className: "absolute inset-0", initial: { opacity: 0 }, animate: { opacity: [0, 0.4, 0] }, transition: { duration: 1.4, ease: "easeOut" }, style: {
                    background: "linear-gradient(180deg, rgba(248,113,113,0.15) 0%, rgba(248,113,113,0.0) 30%, rgba(248,113,113,0.15) 100%)",
                } }), _jsx(motion.div, { className: "text-bear font-display font-bold text-4xl tracking-tight", initial: { y: -6, opacity: 0, scale: 0.95 }, animate: { y: 30, opacity: [0, 1, 0], scale: [0.95, 1, 0.95] }, transition: { duration: 2.0 }, children: fmtUSD(ev.pnl ?? 0, 2) })] }));
}
