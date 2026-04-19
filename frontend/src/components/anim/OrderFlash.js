import { jsx as _jsx } from "react/jsx-runtime";
import { motion } from "framer-motion";
export default function OrderFlash() {
    return (_jsx(motion.div, { className: "absolute left-0 right-0 top-0 h-0.5 bg-accent", initial: { opacity: 0 }, animate: { opacity: [0, 0.8, 0] }, exit: { opacity: 0 }, transition: { duration: 1.4 } }));
}
