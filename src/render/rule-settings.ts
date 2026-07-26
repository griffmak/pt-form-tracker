import type { ExerciseDefinition, RuleOverride } from "../exercise-library/types";
import { saveOverride, clearOverride, loadOverrides } from "../exercise-library/overrides";

/**
 * Lets the user adjust each rule's acceptable angle range for their own body.
 * The library defaults are general PT-literature reference ranges, not a
 * personalized assessment — someone with different limb proportions or an
 * existing mobility limit can be flagged "wrong" while doing nothing wrong.
 */
export function renderRuleSettings(
  container: HTMLElement,
  exercise: ExerciseDefinition,
  overrides: RuleOverride[],
  storage: Storage,
  onChange: (next: RuleOverride[]) => void
): void {
  container.replaceChildren();

  const note = document.createElement("p");
  note.className = "settings-note";
  note.textContent =
    "These ranges are general reference values from public PT guidance — not a personalized or clinical assessment. " +
    "If a range doesn't match your body or your current mobility, adjust it here before starting.";
  container.appendChild(note);

  for (const rule of exercise.rules) {
    const active = overrides.find(
      (o) => o.exerciseId === exercise.id && o.ruleName === rule.name
    );
    const row = document.createElement("div");
    row.className = "rule-row";

    const label = document.createElement("span");
    label.className = "rule-name";
    label.textContent = rule.name;
    row.appendChild(label);

    const minInput = document.createElement("input");
    minInput.type = "number";
    minInput.value = String(active?.minDegrees ?? rule.defaultMinDegrees);

    const maxInput = document.createElement("input");
    maxInput.type = "number";
    maxInput.value = String(active?.maxDegrees ?? rule.defaultMaxDegrees);

    const status = document.createElement("span");
    status.className = "rule-status";
    const setStatus = (isOverridden: boolean) => {
      status.textContent = isOverridden
        ? "adjusted by you"
        : `default (${rule.defaultMinDegrees}-${rule.defaultMaxDegrees}°)`;
    };
    setStatus(Boolean(active));

    const apply = () => {
      const min = Number(minInput.value);
      const max = Number(maxInput.value);
      if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
        status.textContent = "min must be less than max";
        return;
      }
      saveOverride({ exerciseId: exercise.id, ruleName: rule.name, minDegrees: min, maxDegrees: max }, storage);
      setStatus(true);
      onChange(loadOverrides(storage));
    };
    minInput.addEventListener("change", apply);
    maxInput.addEventListener("change", apply);

    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "Reset to default";
    reset.addEventListener("click", () => {
      clearOverride(exercise.id, rule.name, storage);
      minInput.value = String(rule.defaultMinDegrees);
      maxInput.value = String(rule.defaultMaxDegrees);
      setStatus(false);
      onChange(loadOverrides(storage));
    });

    row.append(minInput, document.createTextNode("° to "), maxInput, document.createTextNode("° "), status, reset);
    container.appendChild(row);
  }
}
