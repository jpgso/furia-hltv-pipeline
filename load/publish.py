"""Publicação do dashboard: leva os JSON da gold para docs/data e envia ao GitHub.

O GitHub Pages serve a pasta docs/ da branch principal; basta um push para o site atualizar.
"""
import json
import subprocess
from datetime import datetime
from pathlib import Path

from config import get_logger, settings

logger = get_logger(__name__)

META = "meta.json"


def sync_dashboard_data(export_dir: Path | None = None, dest_dir: Path | None = None) -> bool:
    """Copia as tabelas que o dashboard usa. Devolve True se algum dado mudou.

    O meta.json (data da atualização) só é regravado quando há mudança, para que
    execuções sem partida nova não gerem commit.
    """
    export_dir = Path(export_dir or settings.EXPORT_DIR)
    dest_dir = Path(dest_dir or settings.DASHBOARD_DATA_DIR)
    dest_dir.mkdir(parents=True, exist_ok=True)
    changed = False
    for table in settings.DASHBOARD_TABLES:
        source = export_dir / f"{table}.json"
        if not source.exists():
            raise FileNotFoundError(f"Exportação ausente: {source}")
        content = source.read_bytes()
        target = dest_dir / source.name
        if not target.exists() or target.read_bytes() != content:
            target.write_bytes(content)
            changed = True
    if changed or not (dest_dir / META).exists():
        now = datetime.now()
        meta = {"atualizado_em": now.strftime("%Y-%m-%d"), "atualizado_em_hora": now.strftime("%Y-%m-%d %H:%M")}
        (dest_dir / META).write_text(json.dumps(meta), encoding="utf-8")
    return changed


def _git(repo: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True,
                          encoding="utf-8", errors="replace", timeout=120)


def _error(message: str) -> dict:
    return {"status": "erro", "mensagem": message[:300]}


def push_dashboard(repo_dir: Path | None = None, data_dir: Path | None = None) -> dict:
    """Faz commit só da pasta de dados do dashboard e envia. Nunca lança exceção.

    Só publica a partir da branch principal e só quando os commits locais ainda não
    enviados mexem apenas nos dados: trabalho em andamento nunca é enviado por tabela.
    """
    repo = Path(repo_dir or settings.BASE_DIR)
    data = Path(data_dir or settings.DASHBOARD_DATA_DIR)
    rel = data.relative_to(repo).as_posix()
    try:
        branch = _git(repo, "rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
        if branch != settings.PUBLISH_BRANCH:
            return _error(f"a branch atual é '{branch}'; a publicação só sai de '{settings.PUBLISH_BRANCH}'")
        log = _git(repo, "log", "@{u}..HEAD", "--name-only", "--format=").stdout.splitlines()
        pending = [p.strip() for p in log if p.strip()]  # arquivos dos commits ainda não enviados
        foreign = sorted({p for p in pending if not p.startswith(rel + "/")})
        if foreign:
            return _error(f"há commits locais ainda não enviados fora de {rel} ({foreign[0]}...); envie-os antes")

        _git(repo, "add", "--", rel)
        if _git(repo, "diff", "--cached", "--quiet", "--", rel).returncode != 0:
            stamp = datetime.now().strftime("%Y-%m-%d %H:%M")
            commit = _git(repo, "commit", "-m", f"Atualiza dados do dashboard ({stamp})", "--", rel)
            if commit.returncode != 0:
                return _error(f"commit falhou: {(commit.stderr or commit.stdout).strip()}")
        elif not pending:
            return {"status": "sem_mudanca", "mensagem": ""}
        push = _git(repo, "push", "origin", f"HEAD:{settings.PUBLISH_BRANCH}")
        if push.returncode != 0:
            return _error(f"push falhou: {(push.stderr or push.stdout).strip()}")
        logger.info("Dashboard publicado no GitHub.")
        return {"status": "publicado", "mensagem": ""}
    except Exception as exc:  # git ausente, tempo esgotado etc.
        return _error(str(exc))
