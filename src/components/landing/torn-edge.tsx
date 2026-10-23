/*
 * A torn paper edge: white paper with a ragged rim laid over the photo. Two layers (the paper and a
 * thin grey fibre line just inside it) make the tear read as paper rather than a zigzag. The shapes
 * are fixed paths stretched to the box, so nothing is computed or animated at run time.
 */

/** Ragged boundary for a vertical tear, in a 40 × 1000 box (generated once with a fixed seed): x wanders between 10 and 34 at uneven steps, like a real tear. */
const VERTICAL =
  "M0 0 H22 L19.5 0 L22.9 16.4 L22.2 28.3 L18.7 34.9 L26.3 42.3 L25.1 50.3 L22.0 71.5 L30.6 93.1 L12.8 103.7 L19.8 114.7 L21.7 130.0 L11.4 144.7 L22.3 154.0 L22.5 165.0 L25.0 175.8 L23.3 185.7 L20.9 205.7 L20.0 227.4 L21.7 245.5 L25.6 252.2 L21.1 267.3 L23.8 284.5 L27.4 297.8 L18.6 311.3 L27.9 328.6 L21.9 347.7 L21.1 364.4 L11.4 373.1 L15.9 391.4 L18.8 403.7 L26.8 416.8 L20.8 436.0 L26.8 448.6 L14.2 469.9 L21.6 479.6 L18.0 495.1 L23.7 507.8 L23.2 529.0 L18.5 544.9 L26.7 565.3 L22.0 584.1 L18.6 591.7 L13.9 598.8 L10.0 610.2 L18.7 618.6 L24.1 625.1 L21.5 633.4 L30.4 645.3 L22.8 667.1 L18.2 674.5 L19.6 684.8 L23.3 691.1 L18.3 699.5 L26.6 713.9 L21.7 731.1 L23.3 739.7 L20.2 758.2 L26.5 777.2 L25.4 796.1 L21.6 805.7 L16.7 812.2 L27.6 822.3 L27.9 835.5 L20.2 856.8 L14.9 866.4 L26.4 882.4 L26.0 896.0 L27.1 903.4 L22.8 921.9 L21.3 930.8 L22.0 949.6 L25.2 962.0 L13.6 970.7 L19.5 991.2 L22 1000 H0 Z";

/** Ragged boundary for a horizontal tear, in a 1000 × 40 box: y wanders the same way. */
const HORIZONTAL =
  "M0 0 V22 L0 19.5 L16.4 22.9 L28.3 22.2 L34.9 18.7 L42.3 26.3 L50.3 25.1 L71.5 22.0 L93.1 30.6 L103.7 12.8 L114.7 19.8 L130.0 21.7 L144.7 11.4 L154.0 22.3 L165.0 22.5 L175.8 25.0 L185.7 23.3 L205.7 20.9 L227.4 20.0 L245.5 21.7 L252.2 25.6 L267.3 21.1 L284.5 23.8 L297.8 27.4 L311.3 18.6 L328.6 27.9 L347.7 21.9 L364.4 21.1 L373.1 11.4 L391.4 15.9 L403.7 18.8 L416.8 26.8 L436.0 20.8 L448.6 26.8 L469.9 14.2 L479.6 21.6 L495.1 18.0 L507.8 23.7 L529.0 23.2 L544.9 18.5 L565.3 26.7 L584.1 22.0 L591.7 18.6 L598.8 13.9 L610.2 10.0 L618.6 18.7 L625.1 24.1 L633.4 21.5 L645.3 30.4 L667.1 22.8 L674.5 18.2 L684.8 19.6 L691.1 23.3 L699.5 18.3 L713.9 26.6 L731.1 21.7 L739.7 23.3 L758.2 20.2 L777.2 26.5 L796.1 25.4 L805.7 21.6 L812.2 16.7 L822.3 27.6 L835.5 27.9 L856.8 20.2 L866.4 14.9 L882.4 26.4 L896.0 26.0 L903.4 27.1 L921.9 22.8 L930.8 21.3 L949.6 22.0 L962.0 25.2 L970.7 13.6 L991.2 19.5 L1000 22 V0 Z";

export function TornEdge({ direction }: { direction: "vertical" | "horizontal" }) {
  const vertical = direction === "vertical";
  return (
    <svg
      aria-hidden
      viewBox={vertical ? "0 0 40 1000" : "0 0 1000 40"}
      preserveAspectRatio="none"
      className={vertical ? "pointer-events-none absolute inset-y-0 -left-px z-10 h-full w-10" : "pointer-events-none absolute inset-x-0 -top-px z-10 h-8 w-full"}
      style={{ filter: "drop-shadow(1px 1px 2px rgb(17 17 17 / 0.18))" }}
    >
      <path d={vertical ? VERTICAL : HORIZONTAL} fill="var(--background)" />
      <path d={vertical ? VERTICAL : HORIZONTAL} fill="none" stroke="var(--line-strong)" strokeWidth="1" strokeOpacity="0.6" vectorEffect="non-scaling-stroke" transform={vertical ? "translate(-3 0)" : "translate(0 -3)"} />
    </svg>
  );
}
