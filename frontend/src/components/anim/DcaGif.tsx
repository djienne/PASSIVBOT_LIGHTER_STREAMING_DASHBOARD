import { motion } from "framer-motion";

export const DCA_GIF_MS = 4500;
const DCA_EXIT_MS = 250;

export default function DcaGif({ id }: { id: string }) {
  const gifSrc = `/dca.gif?t=${encodeURIComponent(id)}`;
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, exit: { duration: DCA_EXIT_MS / 1000 } }}
    >
      <motion.div
        className="absolute"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: [0.6, 1.16, 2.35], opacity: [0.5, 0.28, 0] }}
        transition={{ duration: 2.15, ease: "easeOut" }}
        style={{
          width: 300, height: 300, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(52,211,153,0.7) 0%, rgba(52,211,153,0.0) 70%)",
          filter: "blur(5px)",
        }}
      />
      <motion.img
        src={gifSrc}
        alt=""
        className="absolute rounded-lg shadow-[0_0_38px_rgba(52,211,153,0.42)]"
        initial={{ opacity: 0, scale: 0.9, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: -8 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        style={{ width: 520, height: "auto", pointerEvents: "none" }}
        draggable={false}
      />
    </motion.div>
  );
}
