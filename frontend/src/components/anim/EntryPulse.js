import { jsx as _jsx } from "react/jsx-runtime";
import { motion } from "framer-motion";
export default function EntryPulse() {
    return (_jsx(motion.div, { className: "absolute inset-0", initial: { opacity: 0 }, animate: { opacity: [0, 0.6, 0] }, exit: { opacity: 0 }, transition: { duration: 2.2, times: [0, 0.15, 1] }, style: {
            boxShadow: "inset 0 0 120px 20px rgba(52, 211, 153, 0.35)",
        } }));
}
