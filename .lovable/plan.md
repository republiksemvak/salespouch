# Perbaikan Rute Transaksi

## Yang akan diubah
- Jadikan `/transactions` sebagai rute induk yang selalu merender halaman turunannya.
- Pindahkan daftar transaksi ke rute indeks `/transactions` yang independen.
- Pertahankan formulir revisi sebagai rute anak `/transactions/$id/edit` agar dapat dirender.

## Pemeriksaan
- Pastikan struktur rute tergenerasi tanpa konflik.
- Pastikan daftar transaksi dan formulir revisi sama-sama dapat dibuka.
