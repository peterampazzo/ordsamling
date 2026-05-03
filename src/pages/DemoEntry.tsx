import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { activateDemo } from "@/lib/demo";

/**
 * Mounting this component activates demo mode and redirects to /app.
 * Demo entries live in a separate localStorage key, so the user's real
 * data at /app is never touched.
 */
const DemoEntry = () => {
  const navigate = useNavigate();
  useEffect(() => {
    activateDemo();
    navigate("/app", { replace: true });
  }, [navigate]);
  return null;
};

export default DemoEntry;
