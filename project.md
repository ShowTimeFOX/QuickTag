# QuickTag LazyMod

QuickTag LazyMod to rozszerzenie przeglądarki Chromium Manifest V3, które dodaje
do stron pływający interfejs do szybkiego tagowania obrazów. Umożliwia
korzystanie z własnych palet tagów, dopasowanie interfejsu do strony oraz
opcjonalną analizę obrazu przez lokalne ComfyUI i węzeł WD14 Tagger.

## Funkcje

- **Język interfejsu** — cały interfejs użytkownika wtyczki, w tym tagger,
  edytory i strona About, ma być wyświetlany po angielsku. Dokumentacja projektu
  (`PROJECT.md`) pozostaje po polsku.
- **Palety tagów** — wbudowana paleta startowa oraz własne palety podzielone na
  grupy i kategorie. Można przełączać się między paletami, importować i
  eksportować pliki JSON, edytować palety albo usuwać własne palety.
- **Dodawanie i usuwanie tagów** — kliknięcie tagu przełącza jego stan.
  Przyciski zbiorcze dodają albo usuwają widoczne tagi; w sekcji AI ta sama
  akcja obejmuje rozpoznane sugestie.
- **Wyszukiwanie** — wyszukiwanie rozmyte obsługuje dopasowania przybliżone.
  Tryb pisania tagów pozwala rozpocząć wyszukiwanie, gdy fokus nie jest
  w polu edytowalnym. Wyniki można obsługiwać klawiaturą: strzałkami, Enter
  i Escape.
- **Analiza AI** — wysyła obraz do lokalnego ComfyUI-WD14-Tagger, pokazuje
  postęp, filtruje wyniki progiem pewności i respektuje listę wykluczonych
  tagów. Próg pewności jest zapisywany lokalnie.
- **Kopia konfiguracji** — w ustawieniach można wyeksportować lub zaimportować
  wszystkie zapisane dane QuickTag w pliku JSON, w tym palety, profile stron,
  czarną listę AI, ustawienia okna oraz reguły domen i globalnego włączenia.
  Import zastępuje bieżącą konfigurację.
- **Przywracanie ustawień domyślnych** — usuwa zapisane dane rozszerzenia,
  aby po ponownym załadowaniu użyć pierwotnych wartości domyślnych.
- **Profile stron** — dla strony można ustawić selektory CSS pola tagów,
  obrazu i pola/linku źródłowego. Wybór elementu podświetla wskazywany element.
- **Panel rozszerzenia** — po kliknięciu ikony można globalnie włączyć lub
  wyłączyć tagger, ustawić listę dozwolonych albo blokowanych domen, sprawdzić
  połączenie z ComfyUI, sprawdzić dostępność aktualizacji i otworzyć stronę
  About. Nowa wersja jest sygnalizowana badge'em „NEW” przy ikonie rozszerzenia.
- **Edytor palet** — edycja JSON z formatowaniem oraz czytelniejszy tryb
  easyJson.
- **Dopasowanie interfejsu** — przesuwanie, skalowanie, dokowanie przy
  krawędzi, zwijanie i ukrywanie taggera. Tryb ghost można przełączać
  skrótem klawiszowym również wtedy, gdy fokus jest w polu edycji; opcjonalnie
  działa tylko podczas przytrzymywania przycisku lub skrótu. Przezroczystość
  działa również w trybie dokowanym i we wszystkich motywach. Tryb
  dokowany/pływający i krawędź dokowania są zapamiętywane
  osobno dla każdego originu strony. Widoczność i pozycja okna float również
  są pamiętane per strona: po odświeżeniu tagger pozostaje w ustawionym stanie,
  a nowa strona startuje ukryta z uchwytem przy prawej krawędzi ekranu.
- **Motywy interfejsu** — w ustawieniach można wybrać jeden z motywów:
  Dark mode, Light mode, Femboy, Halloween, Minimalistic lub Cyberpunk.
  Każdy motyw ma własny, czytelny zestaw kolorów i charakterystyczne detale;
  dostępny jest także własny kolor akcentu. Wybrany motyw i własny kolor są
  zapisywane lokalnie oraz uwzględniane w kopii konfiguracji.
- **Szybkie akcje** — kopiowanie tagów, czyszczenie pola oraz licznik tagów.
- **Spójny interfejs** — tagger, edytor i strona informacyjna używają angielskich
  etykiet, wspólnych stanów kontrolek i ikon akcji opartych na lekkich SVG;
  poszczególne motywy zachowują własną paletę i oprawę wizualną.

## Wymagania

- Przeglądarka oparta na Chromium obsługująca Manifest V3.
- Dostęp do stron, na których ma działać tagger.
- Opcjonalnie: lokalnie uruchomione ComfyUI z węzłem
  [ComfyUI-WD14-Tagger](https://github.com/pythongosssss/ComfyUI-WD14-Tagger)
  dostępnym pod `http://127.0.0.1:8188`.

## Instalacja rozszerzenia do developmentu

1. Pobierz lub sklonuj projekt na komputer.
2. Otwórz stronę rozszerzeń przeglądarki, np. `chrome://extensions`.
3. Włącz **Developer mode**.
4. Wybierz **Load unpacked** i wskaż folder zawierający `manifest.json`.
5. Po zmianie plików użyj przycisku **Reload** na stronie rozszerzeń, a
   następnie odśwież stronę, na której testujesz QuickTag.

Projekt nie zawiera obecnie skryptu build ani zewnętrznych zależności
JavaScript instalowanych przez menedżer pakietów. Pliki rozszerzenia są
ładowane bezpośrednio z folderu projektu.

## Uruchamianie ComfyUI i instalacja WD14

Analiza AI jest opcjonalna. Tagger i pozostałe funkcje rozszerzenia działają
również bez ComfyUI.

1. Zainstaluj Python 3 i Git.
2. Zainstaluj i uruchom ComfyUI. Jedną z metod opisanych przez projekt
   `comfy-cli` jest:

   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   python -m pip install --upgrade pip
   python -m pip install comfy-cli
   comfy install
   comfy launch
   ```

   Po instalacji sprawdź, czy interfejs ComfyUI jest dostępny pod
   `http://127.0.0.1:8188`. Pozostaw proces ComfyUI uruchomiony podczas
   korzystania z funkcji Analizuj obraz. Więcej informacji:
   [Comfy-Org/comfy-cli](https://github.com/Comfy-Org/comfy-cli).
3. Zainstaluj **ComfyUI-WD14-Tagger** przez ComfyUI-Manager, wyszukując
   „WD14 Tagger”, albo ręcznie w katalogu `ComfyUI\custom_nodes`:

   ```powershell
   git clone https://github.com/pythongosssss/ComfyUI-WD14-Tagger.git
   ```

4. Zainstaluj wymagania w środowisku Pythona używanym przez ComfyUI, zgodnie
   z instrukcjami repozytorium węzła, a następnie uruchom ComfyUI ponownie.
   Modele WD14 są pobierane przy pierwszym użyciu, jeśli nie są już dostępne.
5. Otwórz stronę zawierającą obraz i kliknij **Analizuj obraz** w QuickTag.
   Postęp i błędy połączenia są wyświetlane w sekcji Sugestie AI.

Instrukcje zależności mogą różnić się między instalacją przenośną,
instalacją przez comfy-cli i innymi sposobami uruchamiania ComfyUI. W razie
wątpliwości skorzystaj z aktualnej dokumentacji:
[ComfyUI-WD14-Tagger](https://github.com/pythongosssss/ComfyUI-WD14-Tagger).

## Struktura projektu

| Plik | Rola |
| --- | --- |
| `manifest.json` | Konfiguracja rozszerzenia Manifest V3, uprawnienia, service worker i content script. |
| `assets/icon.png` | Ikona używana na pasku narzędzi przeglądarki i w panelu rozszerzenia. |
| `scripts/background.js` | Obsługa wiadomości rozszerzenia, otwieranie podstron edytora i informacji oraz integracja API ComfyUI i WD14. |
| `pages/extension-popup.html` | Panel ikony rozszerzenia: przełącznik globalny, reguły domen, status ComfyUI i link About. |
| `styles/extension-popup.css` | Style panelu ikony rozszerzenia. |
| `scripts/extension-popup.js` | Obsługa ustawień globalnych, domen, testu połączenia ComfyUI i aktualizacji w panelu. |
| `scripts/content.js` | Wstrzykiwanie taggera na stronę, palety, profile stron, wyszukiwanie, stan tagów i ustawienia interfejsu. |
| `pages/popup.html` | Struktura pływającego interfejsu taggera. |
| `styles/tagger.css` | Wspólne style interfejsu taggera oraz elementów nakładanych na stronę. |
| `styles/theme-dark.css` | Dedykowane kolory i wygląd motywu Dark mode. |
| `styles/theme-light.css` | Dedykowane kolory i wygląd motywu Light mode. |
| `styles/theme-femboy.css` | Dedykowane kolory i wygląd motywu Femboy. |
| `styles/theme-halloween.css` | Dedykowane kolory i wygląd motywu Halloween. |
| `styles/theme-minimalistic.css` | Dedykowane kolory i wygląd motywu Minimalistic. |
| `styles/theme-cyberpunk.css` | Dedykowane kolory i wygląd motywu Cyberpunk. |
| `styles/theme-custom.css` | Bazowy wygląd motywu z własnym kolorem akcentu. |
| `pages/palette-editor.html` | Dokument edytora palet i ustawień. |
| `scripts/palette-editor.js` | Ładowanie, walidacja, konwersja i zapis palet, profili oraz czarnej listy. |
| `styles/palette-editor.css` | Style edytora. |
| `pages/about.html` | Przewodnik funkcji i konfiguracji widoczny po wybraniu zakładki O wtyczce. |
| `styles/about.css` | Style strony informacyjnej. |
| `data/import.json` | Domyślne dane palety ładowane przez rozszerzenie. |

## Architektura i przechowywanie danych

- `scripts/content.js` działa na stronach określonych w `content_scripts` i tworzy
  interfejs wewnątrz Shadow DOM, aby ograniczyć kolizje ze stylami strony.
  Kontener pozostaje niewidoczny w trakcie asynchronicznego ładowania zasobów
  i ustawień, a pokazywany jest dopiero po odtworzeniu właściwego stanu okna,
  co zapobiega miganiu przy odświeżeniu.
- Wspólne komponenty taggera są stylowane w `styles/tagger.css`, a wybrany motyw jest
  asynchronicznie ładowany z osobnego pliku `styles/theme-<nazwa>.css` do tego samego
  Shadow DOM. Pliki motywów są udostępnione content scriptowi przez
  `web_accessible_resources`; host interfejsu pozostaje ukryty do chwili
  załadowania właściwego motywu.
- `scripts/background.js` działa jako service worker Manifest V3. Obsługuje komunikację
  z content scriptem i wysyła żądania do lokalnego ComfyUI.
- Ustawienia, profile stron, palety i czarną listę przechowuje
  `chrome.storage.local` w przeglądarce.
- Globalne włączenie (`lazymod_enabled`) oraz reguły domen
  (`lazymod_domain_mode`, `lazymod_domains`) są zapisywane w `chrome.storage.local`.
  Content script stosuje je przy uruchomieniu i usuwa tagger ze stron, które
  przestają spełniać regułę; strony odblokowane po zmianie reguł są
  przeładowywane, aby zainicjować interfejs.
- Sprawdzanie aktualizacji pobiera publiczny `update.json` z Gista
  `ShowTimeFOX/1c601aab8d8a4b7540b34fc3e273d74f`, porównuje wersję z manifestem
  i ustawia badge „NEW” przez `chrome.action`, gdy Gist wskazuje nowszą wersję.
  Kontrola jest wykonywana przy uruchomieniu, co 6 godzin oraz na żądanie
  w panelu. Przycisk otwiera stronę GitHub Releases; instalacja rozpakowanej
  wersji nadal wymaga ręcznej podmiany plików i przeładowania rozszerzenia.
- Tryb dock/float, krawędź dokowania, widoczność i pozycja float są
  przechowywane per origin w osobnym kluczu
  `lazymod_site_layout_<origin>`, aby niezależne strony nie nadpisywały sobie
  ustawień. Nowe strony domyślnie startują ukryte; kolejne załadowania
  przywracają ostatni stan widoczności i uchwyt przy zapamiętanej krawędzi.
- Eksport obejmuje wpisy z lokalnego magazynu rozszerzenia; import waliduje
  plik i zastępuje zapisane wpisy. Przywrócenie wartości domyślnych czyści
  magazyn rozszerzenia i przeładowuje bieżącą stronę, aby zastosować stan
  początkowy.
- Edytor otwiera się jako wewnętrzna strona rozszerzenia. Tryb easyJson
  pozwala edytować strukturę palety bez ręcznego wpisywania składni JSON.
- Analiza ComfyUI korzysta z węzła `WD14Tagger|pysssss`: rozszerzenie pobiera
  obraz strony, przesyła go do `/upload/image`, uruchamia workflow przez
  `/prompt`, sprawdza `/history` i `/queue`, a następnie odczytuje tagi.
- ComfyUI jest wskazane w kodzie jako `http://127.0.0.1:8188`. Inny host lub
  port wymaga zgodnej zmiany konfiguracji i uprawnień hosta.

## Walidacja zmian

Po zmianach JavaScriptu można sprawdzić składnię poleceniami:

```powershell
node --check scripts/background.js
node --check scripts/content.js
node --check scripts/extension-popup.js
node --check scripts/palette-editor.js
```

Zmiany w `manifest.json` należy sprawdzić jako poprawny JSON i następnie
przeładować rozszerzenie w przeglądarce. Pełny test analizy AI wymaga
działającego lokalnego ComfyUI z zainstalowanym węzłem WD14.

## Utrzymywanie dokumentacji

Przy każdej kolejnej zmianie funkcji, architektury, konfiguracji lub struktury
plików aktualizuj `PROJECT.md` oraz `CHANGELOG.md` w ramach tego samego zadania.
Opis powinien odzwierciedlać aktualny kod; pomijaj zmiany czysto kosmetyczne,
które nie wpływają na użycie ani utrzymanie projektu.
