export type GarmentType =
  | "jacket" | "knit" | "asymmetric" | "overshirt"
  | "wide-pants" | "straight-pants" | "skirt" | "coat"
  | "soft-bag" | "box-bag" | "loafer" | "sneaker"
  | "scarf" | "silver" | "blazer" | "vest";

const colors: Record<string, string> = {
  ink: "#171717", bone: "#e8e5df", olive: "#8d927f", wine: "#6e3d45",
  blue: "#8f9fa6", clay: "#a67e69", gray: "#858585", cream: "#f3efe6",
};

export function GarmentIllustration({ type, tone = "ink" }: { type: GarmentType; tone?: keyof typeof colors }) {
  const fill = colors[tone];
  const stroke = "#111";

  return (
    <svg className="garment-svg" viewBox="0 0 240 240" role="img" aria-label={`${type} 单品示意`}>
      <rect width="240" height="240" fill="#f7f7f5" />
      {(type === "jacket" || type === "blazer" || type === "overshirt" || type === "coat") && (
        <g fill={fill} stroke={stroke} strokeWidth="1.4">
          <path d={type === "coat" ? "M70 48 98 34h44l28 14 22 142-52 10-20-80-20 80-52-10Z" : "M76 58 101 42h38l25 16 24 104-39 12-9-64v76H100v-76l-9 64-39-12Z"} />
          <path d="m101 42 19 28 19-28-5 70h-28Z" fill="#fff" fillOpacity=".28" />
          <path d="M120 70v116" fill="none" />
          {type !== "coat" && <><path d="M101 122h-22" fill="none" /><path d="M139 122h22" fill="none" /></>}
        </g>
      )}
      {(type === "knit" || type === "vest" || type === "asymmetric") && (
        <g fill={fill} stroke={stroke} strokeWidth="1.4">
          <path d={type === "asymmetric" ? "M82 56 105 42h35l23 19 24 104-37 10-12-58-8 73-48-5 9-74-12 64-38-12Z" : type === "vest" ? "M88 55 105 42h30l17 13-10 30-9-9v108H107V76l-9 9Z" : "M77 60 102 43h36l25 17 25 103-38 12-12-61v72H102v-72l-12 61-38-12Z"} />
          {type === "knit" && <path d="M91 88h58M87 105h66M100 128h40" fill="none" opacity=".45" />}
        </g>
      )}
      {(type === "wide-pants" || type === "straight-pants") && (
        <g fill={fill} stroke={stroke} strokeWidth="1.4">
          <path d={type === "wide-pants" ? "M80 42h80l20 156h-55l-5-91-5 91H60Z" : "M86 42h68l11 156h-42l-3-94-3 94H75Z"} />
          <path d="M87 58h66M120 43v61" fill="none" />
        </g>
      )}
      {type === "skirt" && <path d="M91 47h58l28 145H63Z" fill={fill} stroke={stroke} strokeWidth="1.4" />}
      {(type === "soft-bag" || type === "box-bag") && (
        <g fill={fill} stroke={stroke} strokeWidth="1.4">
          <path d={type === "soft-bag" ? "M55 104q65-35 130 0l-14 78H69Z" : "M62 94h116v88H62Z"} />
          <path d="M88 99q0-48 32-48t32 48" fill="none" strokeWidth="4" />
        </g>
      )}
      {(type === "loafer" || type === "sneaker") && (
        <g fill={fill} stroke={stroke} strokeWidth="1.4">
          <path d={type === "loafer" ? "M42 141q33-5 54-45 28 30 90 37l16 32q-79 18-157 1Z" : "M39 132q38 0 58-45l35 33q31 9 70 25l-8 28H48Z"} />
          <path d="M53 161h141M108 112l37 20M116 103l37 22" fill="none" />
        </g>
      )}
      {type === "scarf" && <path d="M80 44q78 15 80 70-15 31-42 23l35 59-30 10-30-70q-31-20-13-92Z" fill={fill} stroke={stroke} strokeWidth="1.4" />}
      {type === "silver" && <g fill="none" stroke="#777" strokeWidth="8"><circle cx="120" cy="120" r="54" /><path d="m84 80 72 80M158 82l-76 74" /></g>}
    </svg>
  );
}
