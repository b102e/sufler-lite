type VTDocument = Document & {
  startViewTransition: (callback: () => void) => { finished: Promise<void> };
};

export function transitionTo(fn: () => void) {
  if (typeof document !== "undefined" && "startViewTransition" in document) {
    (document as VTDocument).startViewTransition(fn);
  } else {
    fn();
  }
}
