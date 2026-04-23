"""
Riot Games - League of Legends Match Data Extractor
Extrai as últimas N partidas ranqueadas e salva os JSONs brutos localmente.

Uso:
  export RIOT_API_KEY="RGAPI-sua-chave-aqui"
  python scripts/riot_extractor.py
"""

import os
import json
import time
import requests

# =============================================================================
# CONFIGURAÇÕES — edite apenas esta seção
# =============================================================================
API_KEY              = os.environ.get("RIOT_API_KEY", "")
RIOT_ID              = os.environ.get("RIOT_ID", "Delsin#LEWA")
REGION               = os.environ.get("REGION", "br1")
QUANTIDADE_PARTIDAS  = int(os.environ.get("QUANTIDADE_PARTIDAS", "20"))
OUTPUT_DIR           = os.environ.get("OUTPUT_DIR", "raw_data")

# Roteamento regional para Match V5 e Account API (BR1 → americas)
REGIONAL_HOST = "https://americas.api.riotgames.com"
PLATFORM_HOST = f"https://{REGION}.api.riotgames.com"

# Fila 420 = Ranked Solo/Duo
QUEUE_ID = 420

# Retry settings
MAX_RETRIES  = 5
BACKOFF_BASE = 1  # segundos
# =============================================================================


def _check_api_key() -> None:
    if not API_KEY:
        raise SystemExit(
            "[ERRO] RIOT_API_KEY não configurada.\n"
            "       Execute: export RIOT_API_KEY='RGAPI-sua-chave-aqui'\n"
            "       Ou crie backend/.env com RIOT_API_KEY=RGAPI-sua-chave-aqui"
        )


def _get(url: str, params: dict = None) -> dict:
    """
    GET com retry automático para 429 (rate limit) e backoff exponencial.
    Lança exceções claras para 403/404 e outros erros fatais.
    """
    headers = {"X-Riot-Token": API_KEY}
    attempt = 0

    while attempt < MAX_RETRIES:
        try:
            resp = requests.get(url, headers=headers, params=params, timeout=10)
        except requests.exceptions.RequestException as exc:
            raise SystemExit(f"[ERRO DE REDE] {exc}") from exc

        if resp.status_code == 200:
            return resp.json()

        if resp.status_code == 429:
            retry_after = int(resp.headers.get("Retry-After", BACKOFF_BASE * (2 ** attempt)))
            print(f"  [429] Rate limit atingido. Aguardando {retry_after}s "
                  f"(tentativa {attempt + 1}/{MAX_RETRIES})...")
            time.sleep(retry_after)
            attempt += 1
            continue

        if resp.status_code == 403:
            raise SystemExit(
                "[403] Acesso negado — verifique se a API Key é válida e não expirou.\n"
                "      Renove em: https://developer.riotgames.com/"
            )

        if resp.status_code == 404:
            raise LookupError(f"[404] Recurso não encontrado: {url}")

        raise SystemExit(f"[{resp.status_code}] Erro inesperado na requisição: {url}\n{resp.text}")

    raise SystemExit(f"[ERRO] Máximo de tentativas atingido para: {url}")


def resolve_puuid(game_name: str, tag_line: str) -> str:
    """Riot ID (Nome#Tag) → PUUID via Account API."""
    url = f"{REGIONAL_HOST}/riot/account/v1/accounts/by-riot-id/{game_name}/{tag_line}"
    print(f"[1/3] Resolvendo PUUID para '{game_name}#{tag_line}'...")
    data = _get(url)
    puuid = data["puuid"]
    print(f"      PUUID: {puuid}")
    return puuid


def get_match_ids(puuid: str, count: int) -> list[str]:
    """PUUID → lista de IDs das últimas N partidas ranqueadas."""
    url = f"{REGIONAL_HOST}/lol/match/v5/matches/by-puuid/{puuid}/ids"
    params = {"queue": QUEUE_ID, "start": 0, "count": count}
    print(f"[2/3] Buscando IDs das últimas {count} partidas ranqueadas...")
    ids = _get(url, params=params)
    print(f"      {len(ids)} partida(s) encontrada(s).")
    return ids


def fetch_match(match_id: str) -> dict:
    """Match ID → JSON completo da partida."""
    url = f"{REGIONAL_HOST}/lol/match/v5/matches/{match_id}"
    return _get(url)


def save_json(data: dict, path: str) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def main() -> None:
    _check_api_key()

    game_name, tag_line = RIOT_ID.split("#", 1)

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Etapa 1 — PUUID
    try:
        puuid = resolve_puuid(game_name, tag_line)
    except LookupError:
        raise SystemExit(
            f"[404] Summoner '{RIOT_ID}' não encontrado. "
            "Verifique o nome e a tag."
        )

    # Etapa 2 — IDs das partidas
    match_ids = get_match_ids(puuid, QUANTIDADE_PARTIDAS)

    if not match_ids:
        print("Nenhuma partida ranqueada encontrada para este jogador.")
        return

    # Etapa 3 — Download e salvamento de cada partida
    print(f"[3/3] Baixando e salvando partidas em '{OUTPUT_DIR}/'...")
    sucesso = 0
    falhas  = []

    for idx, match_id in enumerate(match_ids, start=1):
        destino = os.path.join(OUTPUT_DIR, f"{match_id}.json")

        if os.path.exists(destino):
            print(f"  [{idx:>2}/{len(match_ids)}] {match_id} — já existe, pulando.")
            sucesso += 1
            continue

        try:
            match_data = fetch_match(match_id)
            save_json(match_data, destino)
            print(f"  [{idx:>2}/{len(match_ids)}] {match_id} — salvo.")
            sucesso += 1
        except LookupError as exc:
            print(f"  [{idx:>2}/{len(match_ids)}] {match_id} — {exc}")
            falhas.append(match_id)
        except SystemExit as exc:
            print(f"  [{idx:>2}/{len(match_ids)}] {match_id} — erro fatal: {exc}")
            falhas.append(match_id)

        # Pequena pausa para respeitar o rate limit de aplicação (20 req/s)
        time.sleep(0.05)

    # Resumo final
    print("\n" + "=" * 50)
    print(f"  Partidas baixadas com sucesso : {sucesso}/{len(match_ids)}")
    if falhas:
        print(f"  Falhas                        : {len(falhas)}")
        for fid in falhas:
            print(f"    - {fid}")
    print(f"  Arquivos salvos em            : ./{OUTPUT_DIR}/")
    print("=" * 50)


if __name__ == "__main__":
    main()
