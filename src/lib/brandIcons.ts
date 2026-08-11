import { Brand } from "../types";

// Icon/emoji riêng cho từng brand trên các view lịch nhiều-brand (LiveCalendar Agency) — giúp
// nhận diện nhanh session/ca của brand nào mà không cần đọc hết tên. Dùng thẳng `Brand.logo`
// (emoji tự chọn khi tạo brand ở CRM & Projects, cùng field đã hiển thị ở Header switcher/
// BrandDashboard) — không tạo bảng mapping riêng, tránh 2 nguồn sự thật cho "icon của brand".
export const getBrandEmoji = (brand: Pick<Brand, "logo"> | null | undefined): string => brand?.logo || "🏷️";
