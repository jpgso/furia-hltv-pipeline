"""
Módulo de Limpeza e Refinamento (Silver Layer)
Responsável por aplicar Data Flattening, RegEx e corrigir Schema Drift da camada Bronze.
"""
from .clean_builder import process_silver_layer

__all__ = [
    "process_silver_layer"
]