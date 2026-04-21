/**
 * LiquidEther wrapper
 *
 * Mounts LiquidEther once and freezes it permanently via memo(() => true).
 * All performance tuning is done through initial props (resolution,
 * iterationsPoisson, BFECC, etc.) — the library handles everything else
 * internally. No scroll tracking, no imperative handles, no re-renders.
 */

import { memo } from "react";
import LiquidEtherBase from "@/components/liquid-ether/LiquidEther";

type LiquidEtherProps = React.ComponentPropsWithoutRef<typeof LiquidEtherBase>;

const LiquidEther = memo(
  function LiquidEther(props: LiquidEtherProps) {
    return <LiquidEtherBase {...props} />;
  },
  () => true // always bail — mounted once, never re-rendered
);

export default LiquidEther;