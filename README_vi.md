# Open DeepSeek Harness Desktop

[English](README.md) | [简体中文](README.zh.md) | [繁體中文](README_tw.md) | [日本語](README_ja.md) | [한국어](README_ko.md) | [Deutsch](README_de.md) | [Español](README_es.md) | [Français](README_fr.md) | [Italiano](README_it.md) | [Português](README_pt.md) | [Русский](README_ru.md) | [العربية](README_ar.md) | [Bahasa Indonesia](README_id.md) | [ไทย](README_th.md) | Tiếng Việt

Open DeepSeek Harness Desktop là bản phân phối máy tính để bàn của [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), được cộng đồng duy trì độc lập. Dự án kết hợp môi trường agent dựa trên plugin với không gian làm việc trực quan để quản lý API tương thích, mô hình tùy chỉnh, workspace, phiên, plugin và Skill.

Đây không phải là sản phẩm chính thức của DeepSeek. Dự án được phát hành theo [Giấy phép MIT](LICENSE) và hiện ở giai đoạn xem trước dành cho nhà phát triển.

## Khả năng chính

- Cấu hình DeepSeek hoặc API tương thích, URL cơ sở, tham chiếu khóa và mã mô hình trong bước khởi động hoặc phần Cài đặt.
- Quản lý phiên lâu dài, sao chép hoặc xóa tin nhắn, xóa hội thoại và xem tóm tắt các bước thực thi quan trọng.
- Cài đặt plugin registry được hỗ trợ qua quy trình một lần nhấp có kiểm soát, đồng thời sử dụng Skill, giao diện và nền trò chuyện cục bộ.
- Chạy ứng dụng từ mã nguồn đã được kiểm tra trước trên macOS. Bộ cài Windows và Linux vẫn cần đóng gói và xác thực trên nền tảng gốc.

## Chạy từ mã nguồn

Cài Node.js `^22.19.0 || >=24.0.0` và pnpm `11.7.0`, sau đó chạy:

```sh
pnpm install
pnpm run build
pnpm run dev:desktop
```

Đọc [README tiếng Anh](README.md) hoặc [README tiếng Trung giản thể](README.zh.md) để xem đầy đủ tính năng, kiến trúc, bảo mật và trạng thái nền tảng. Bạn cũng có thể xem [tài liệu ứng dụng desktop](apps/desktop/README.md) và [hướng dẫn người dùng](docs/user/guide/index.md).

## Giới thiệu FLAQ.AI

[FLAQ.AI](https://flaq.ai/) cung cấp mô hình hình ảnh, video, âm thanh và ngôn ngữ thông qua API, tài liệu và quy trình dành cho nhà phát triển. Dịch vụ này không bắt buộc để chạy dự án. Trước khi sử dụng, hãy kiểm tra khả năng, giá và điều khoản xử lý dữ liệu hiện tại trong [tài liệu FLAQ.AI](https://flaq.ai/docs/).

## Giấy phép

Dự án được phát hành theo [Giấy phép MIT](LICENSE).
