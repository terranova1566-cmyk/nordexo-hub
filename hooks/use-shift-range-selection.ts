import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";

type ShiftEventCandidate = {
  shiftKey?: unknown;
  nativeEvent?: {
    shiftKey?: unknown;
  };
};

const eventHasShiftKey = (event: unknown) => {
  if (!event || typeof event !== "object") return false;
  const candidate = event as ShiftEventCandidate;
  if (typeof candidate.shiftKey === "boolean") {
    return candidate.shiftKey;
  }
  if (typeof candidate.nativeEvent?.shiftKey === "boolean") {
    return candidate.nativeEvent.shiftKey;
  }
  return false;
};

type UseShiftRangeSelectionOptions<Id extends string> = {
  orderedIds: readonly Id[];
  selectedIds: ReadonlySet<Id>;
  setSelectedIds: Dispatch<SetStateAction<Set<Id>>>;
};

export function useShiftRangeSelection<Id extends string>({
  orderedIds,
  selectedIds,
  setSelectedIds,
}: UseShiftRangeSelectionOptions<Id>) {
  const anchorIdRef = useRef<Id | null>(null);
  const shiftPressedRef = useRef(false);

  const indexById = useMemo(() => {
    const next = new Map<Id, number>();
    orderedIds.forEach((id, index) => {
      next.set(id, index);
    });
    return next;
  }, [orderedIds]);

  useEffect(() => {
    if (anchorIdRef.current && !indexById.has(anchorIdRef.current)) {
      anchorIdRef.current = null;
    }
  }, [indexById]);

  useEffect(() => {
    if (selectedIds.size === 0) {
      anchorIdRef.current = null;
    }
  }, [selectedIds]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        shiftPressedRef.current = true;
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        shiftPressedRef.current = false;
      }
    };
    const handleWindowBlur = () => {
      shiftPressedRef.current = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, []);

  const clearAnchor = useCallback(() => {
    anchorIdRef.current = null;
  }, []);

  const toggleWithRange = useCallback(
    (id: Id, checked: boolean, event?: unknown) => {
      const targetIndex = indexById.get(id);
      if (targetIndex === undefined) return;

      const shiftRequested = eventHasShiftKey(event) || shiftPressedRef.current;

      setSelectedIds((prev) => {
        const next = new Set(prev);
        const anchorId = anchorIdRef.current;
        const anchorIndex = anchorId ? indexById.get(anchorId) : undefined;
        const useRange = shiftRequested && anchorIndex !== undefined;

        if (useRange) {
          const [start, end] =
            anchorIndex <= targetIndex
              ? [anchorIndex, targetIndex]
              : [targetIndex, anchorIndex];

          for (let index = start; index <= end; index += 1) {
            const currentId = orderedIds[index];
            if (!currentId) continue;
            if (checked) {
              next.add(currentId);
            } else {
              next.delete(currentId);
            }
          }
        } else if (checked) {
          next.add(id);
        } else {
          next.delete(id);
        }

        return next;
      });

      anchorIdRef.current = id;
    },
    [indexById, orderedIds, setSelectedIds]
  );

  return {
    clearAnchor,
    toggleWithRange,
  };
}
