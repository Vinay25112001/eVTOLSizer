/* The SI / IMP switch a studio puts in its own header. Shows the system
   currently in force, not the one it would switch to — a button labelled
   with the thing you are not looking at is read backwards about half the
   time. */
import { useUnitSystem } from "./unit-system.jsx";

export function UnitToggle({ style }) {
  const { system, toggle } = useUnitSystem();
  return (
    <button type="button" onClick={toggle} style={style}
      title={system === "SI" ? "Showing metric — switch to imperial"
                             : "Showing imperial — switch to metric"}>
      {system === "SI" ? "SI" : "IMP"}
    </button>
  );
}
