# Open DeepSeek Harness Desktop

[English](README.md) | [简体中文](README.zh.md) | [繁體中文](README_tw.md) | [日本語](README_ja.md) | [한국어](README_ko.md) | [Deutsch](README_de.md) | [Español](README_es.md) | [Français](README_fr.md) | [Italiano](README_it.md) | [Português](README_pt.md) | [Русский](README_ru.md) | [العربية](README_ar.md) | Bahasa Indonesia | [ไทย](README_th.md) | [Tiếng Việt](README_vi.md)

Open DeepSeek Harness Desktop adalah distribusi desktop [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) yang dikelola secara independen oleh komunitas. Proyek ini menggabungkan runtime agen berbasis plugin dengan ruang kerja visual untuk mengelola API yang kompatibel, model khusus, workspace, sesi, plugin, dan Skill.

Proyek ini bukan produk resmi DeepSeek. Kode dirilis dengan [Lisensi MIT](LICENSE) dan saat ini masih dalam tahap pratinjau pengembang.

## Kemampuan utama

- Atur DeepSeek atau API yang kompatibel, URL dasar, referensi kunci, dan ID model saat penyiapan awal atau melalui Pengaturan.
- Kelola sesi persisten, salin atau hapus pesan, bersihkan percakapan, dan tinjau ringkasan langkah eksekusi penting.
- Pasang plugin registry yang didukung melalui alur satu klik yang terkendali serta gunakan Skill, tema, dan latar obrolan lokal.
- Menjalankan desktop dari kode sumber telah diuji terlebih dahulu di macOS. Installer Windows dan Linux masih memerlukan pengemasan dan validasi native.

## Menjalankan dari kode sumber

Pasang Node.js `^22.19.0 || >=24.0.0` dan pnpm `11.7.0`, lalu jalankan:

```sh
pnpm install
pnpm run build
pnpm run dev:desktop
```

Baca [README bahasa Inggris](README.md) atau [README bahasa Mandarin Sederhana](README.zh.md) untuk fitur lengkap, arsitektur, keamanan, dan status platform. Tersedia juga [referensi desktop](apps/desktop/README.md) dan [panduan pengguna](docs/user/guide/index.md).

## Tentang FLAQ.AI

[FLAQ.AI](https://flaq.ai/) menyediakan model gambar, video, audio, dan bahasa melalui API, dokumentasi, serta alur kerja pengembang. Layanan ini tidak diperlukan untuk menjalankan proyek. Sebelum menggunakannya, periksa dukungan, harga, dan ketentuan pemrosesan data terbaru di [dokumentasi FLAQ.AI](https://flaq.ai/docs/).

## Lisensi

Proyek ini tersedia dengan [Lisensi MIT](LICENSE).
