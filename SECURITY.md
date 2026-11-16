<p align="right"><a href="#security-policy">English</a> · <b>Türkçe</b></p>

# Güvenlik

## Açık bildirme

Bir güvenlik açığı bulduysan lütfen herkese açık issue açma. GitHub'da bu deponun **Security › Report a vulnerability** sayfasından gizli bildirim gönder. Bildirimi aldığımızı birkaç gün içinde yanıtlar, düzeltme yayımlanana kadar ayrıntıları gizli tutarız.

## Uygulamadaki önlemler

- **Oturumlar:** 32 baytlık rastgele anahtarlar; veritabanında yalnızca SHA-256 özeti tutulur. Şifre değişince diğer oturumlar, sıfırlanınca tüm oturumlar kapanır.
- **Şifreler:** bcrypt. Sıfırlama bağlantıları 256 bit, tek kullanımlık ve 1 saat geçerlidir.
- **Sosyal giriş:** Apple ve Google kimlik anahtarlarının imzası, yayıncısı ve hedefi doğrulanır. E-posta sahipliği kanıtlanmamış bir hesaba sosyal giriş bağlanırken o hesabın şifresi ve oturumları silinir; böylece başkasının e-postasıyla önceden açılmış bir hesap ele geçirme aracı olamaz.
- **Yetki:** her kayıt, isteği yapan kişiye ya da üyesi olduğu ortak alana göre süzülür. Ortak alandan çıkarılan üyenin davet kodları geçersiz olur; ortak alanı yalnızca sahibi geri yükleyebilir.
- **Sınırlar:** giriş, kayıt, şifre sıfırlama, misafir hesabı, davet ve saat eşleştirme uçlarında istek sınırı; istek gövdesi 1 MB (yedek geri yükleme 25 MB).
- **Web:** Content Security Policy, `X-Frame-Options: DENY`, `nosniff`, HSTS ve izin politikası (`apps/mobile/security-headers.conf`).
- **CSV dışa aktarma:** `=`, `+`, `-`, `@` ile başlayan notlar formül olarak çalışmasın diye kaçışlanır.
- **Hata takibi:** Sentry'ye yalnızca yol ve yöntem gönderilir; kişisel veri gönderilmez.

## Kendi sunucunda çalıştırırken

- **Ters vekil ve IP adresi:** İstek sınırları istemci IP'sini `X-Forwarded-For` başlığının ilk değerinden okur. Önündeki ters vekil (Traefik, Caddy vb.) istemciden gelen `X-Forwarded-For` başlığını silip kendisi yazmalı; aksi halde sınırlar atlatılabilir. API'yi doğrudan internete açma, yalnızca `web` servisini aç.
- **E-posta:** `SMTP_URL` tanımlı değilse şifre sıfırlama bağlantıları API günlüğüne yazılır. Günlüklere erişen herkes bu bağlantıları görebileceği için üretimde SMTP tanımla.
- **Geliştirici aboneliği:** `ALLOW_DEV_BILLING=1` üretimde tanımlanmamalı; herkesin kendine Kumbara+ açmasına izin verir.
- **Varsayılan şifre:** `docker compose` ayarsız çalışsın diye veritabanı şifresi varsayılan olarak `kumbara`dır. Veritabanı dışarı açılmaz ama internete açık her kurulumda `POSTGRES_PASSWORD` değiştirilmelidir.
- **Gizli dosyalar:** `.env`, `google-services.json` ve Firebase hizmet hesabı anahtarları depoya eklenmez (`.gitignore`). EAS derlemelerinde gizli dosya değişkenleri kullan.

---

## Security policy

### Reporting a vulnerability

Please do not open public issues for security problems. Use **Security › Report a vulnerability** on this repository to send a private report. We will acknowledge it within a few days and keep the details private until a fix is released.

### What the app does

- **Sessions:** 32-byte random tokens; only their SHA-256 hash is stored. Changing the password ends other sessions; a reset ends all of them.
- **Passwords:** bcrypt. Reset links are 256-bit, single-use and valid for one hour.
- **Social sign-in:** Apple and Google ID tokens are verified (signature, issuer, audience). When a social login is linked to an account whose email ownership was never proven, that account's password and sessions are removed, so a pre-registered account cannot be used to take over the real owner's data.
- **Authorization:** every record is scoped to the caller or to a shared space they belong to. Invite codes are revoked when a member is removed; only the owner can restore a shared space.
- **Limits:** rate limits on sign-in, sign-up, password reset, demo accounts, invites and watch pairing; request bodies are capped at 1 MB (25 MB for backup restore).
- **Web:** Content Security Policy, `X-Frame-Options: DENY`, `nosniff`, HSTS and a permissions policy (`apps/mobile/security-headers.conf`).
- **CSV export:** notes starting with `=`, `+`, `-` or `@` are escaped so they do not run as formulas.
- **Error tracking:** only the path and method are sent to Sentry; no personal data.

### When self-hosting

- **Reverse proxy and client IP:** rate limits read the client IP from the first `X-Forwarded-For` value. Your reverse proxy (Traefik, Caddy, …) must drop any client-supplied `X-Forwarded-For` and set its own, otherwise the limits can be bypassed. Do not expose the API directly; expose only the `web` service.
- **Email:** without `SMTP_URL`, password reset links are written to the API log, where anyone with log access can see them. Configure SMTP in production.
- **Developer subscription:** never set `ALLOW_DEV_BILLING=1` in production; it lets anyone enable Kumbara+ for themselves.
- **Default password:** so that `docker compose` works without configuration, the database password defaults to `kumbara`. The database is not exposed, but change `POSTGRES_PASSWORD` on any internet-facing install.
- **Secret files:** `.env`, `google-services.json` and Firebase service account keys are never committed (`.gitignore`). Use secret file variables for EAS builds.
