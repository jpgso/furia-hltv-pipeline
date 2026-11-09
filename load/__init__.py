"""
Módulo de Persistência (Storage Layer)
Responsável pelo roteamento de dados, desduplicação (Upsert) e gravação em Parquet.
"""

from .storage import upsert_entity_to_master

__all__ = [
    "upsert_entity_to_master"
]