"""
Módulo de Transformação (Processing Layer)
Higienização em memória, Feature Engineering e Data Cleansing utilizando Polars.
"""

from .processor import clean_and_type_data

__all__ = [
    "clean_and_type_data"
]