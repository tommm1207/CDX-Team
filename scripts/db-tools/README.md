# Công cụ sao lưu, DB test và kiểm thử

Dự án có 2 DB Supabase:

| DB | File cấu hình | Dùng cho |
|---|---|---|
| Thật (`whyulopkxtqlqrhbxdgt`) | `.env` | App nhân viên đang dùng |
| Test (`cdx-test`) | `.env.test` | Thử code và thay đổi DB trước khi đưa lên thật |

Hai file `.env*` không được commit (đã có trong `.gitignore`).

## Sao lưu đầy đủ (chỉ đọc)

```bash
node scripts/db-tools/backup_full.mjs --env .env --out ../CDX-backups
```

Tạo thư mục `full_<thời gian>/` gồm `manifest.json` (số dòng mỗi bảng), `schema.json` (cột, ràng buộc,
index, RLS policy, trigger, hàm) và `data/<bảng>.json`. Ngày giờ giữ nguyên dạng chuỗi của Postgres.

Backup tự động hằng ngày (`daily_backup_telegram.mjs`, GitHub Actions 23:00) gửi lên Telegram 2 file:
file Excel để đọc, và `CDX_Full_<ngày>.json.gz` chứa đầy đủ như trên để khôi phục.

## Dựng / làm sạch DB test

```bash
# từ thư mục backup hoặc file .json.gz tải từ Telegram
node scripts/db-tools/restore_to_test.mjs ../CDX-backups/full_... --reset
```

Script từ chối chạy nếu `DATABASE_URL` là DB thật. `--reset` xóa toàn bộ bảng và hàm trong DB test rồi dựng lại.

## Chạy app trên DB test và kiểm thử

```bash
npx vite --mode test --port 5199 --strictPort    # cửa sổ 1: app đọc .env.test
node scripts/db-tools/e2e/run_all.mjs            # cửa sổ 2: toàn bộ bài thử
```

Bài thử đăng nhập bằng tài khoản `admindev`, bấm trên giao diện như người dùng rồi kiểm tra lại DB.
Mọi request tới DB thật đều bị chặn. Các bài thử ghi dữ liệu vào DB test, nên hãy dựng lại DB test sạch
trước mỗi lần chạy. Một số bài dùng dữ liệu cụ thể của bản sao lưu ngày 23/10/2026 (ví dụ phiếu Rã
`XA20260628-2604`); khi dữ liệu thật thay đổi nhiều thì cần chỉnh lại.

Ảnh chụp màn hình khi lỗi nằm trong thư mục tạm của hệ điều hành: `cdx-e2e-shots`.
