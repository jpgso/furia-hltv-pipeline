import logging
from logging.handlers import RotatingFileHandler
from typing import Optional, Dict, Any, Literal
from pathlib import Path
import os
from datetime import datetime

# Governança: Gera um timestamp único no exato momento em que a esteira é acionada
EXECUTION_TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M%S")

class Logger:
    def __init__(self,
                 settings:Optional[Dict]=None,
                 logpath:Optional[str]=None,
                 max_sizefile:Optional[int]=None,
                 bkp_count:Optional[int]=None,
                 loglevel: Optional[Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]]=None,
                 console_display:Optional[bool]=None,
                 name:Optional[str]=None):
        
        self.settings = settings if settings is not None else {}
        self.logpath = Path(logpath) if logpath is not None else Path(self.settings.get('logpath', f'./logs/hltv_pipeline_{EXECUTION_TIMESTAMP}.txt'))
        self.max_sizefile = max_sizefile if max_sizefile is not None else self.settings.get('max_sizefile', 5)
        self.bkp_count = bkp_count if bkp_count is not None else self.settings.get('bkp_count', 5)
        self.loglevel = loglevel if loglevel is not None else self.settings.get('loglevel', 'INFO')
        self.console_display = console_display if console_display is not None else self.settings.get('console_display', True)
        self.name = name if name is not None else __name__

        self._validate_parameters()

    def _validate_parameters(self):
        if self.max_sizefile <= 0:
            raise ValueError('max_filesize deve ser maior que 0.')
        if self.bkp_count <= 0:
            raise ValueError('bkp_count deve ser maior que 0.')

        valid_levels = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']
        if self.loglevel not in valid_levels:
            raise ValueError(f'loglevel deve ser um de: {valid_levels}')
        if self.name is None:
            raise ValueError('name obrigatório, utilize __name__')

    def _init_logger(self) -> logging.Logger:
        # Garante a criação do diretório de logs
        self.logpath.parent.mkdir(parents=True, exist_ok=True)

        logger = logging.getLogger(self.name)
        
        # Evita a duplicidade de handlers caso o logger seja chamado múltiplas vezes
        if logger.handlers:
            return logger

        logger.setLevel(self.loglevel)
        formatter = logging.Formatter(
            fmt="[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S")

        # Mantemos o RotatingFileHandler como margem de segurança caso a execução do backfill gere dados massivos
        file_handler = RotatingFileHandler(
            filename=self.logpath,
            maxBytes=self.max_sizefile*1024*1024,
            backupCount=self.bkp_count,
            encoding='utf-8' # Adicionado encoding para evitar falhas com caracteres especiais na HLTV
        )
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

        if self.console_display:
            console_handler = logging.StreamHandler()
            console_handler.setFormatter(formatter)
            logger.addHandler(console_handler)

        return logger

def get_logger(name: str) -> logging.Logger:
    """Fábrica para instanciar o Logger padronizado em todo o pipeline."""
    base_dir = Path(__file__).resolve().parent.parent
    
    # Nomeação dinâmica: pipeline_furia_YYYYMMDD_HHMMSS.txt
    log_filename = f"pipeline_furia_{EXECUTION_TIMESTAMP}.txt"
    log_file = os.path.join(base_dir, "logs", log_filename)
    
    logger_instance = Logger(
        name=name,
        logpath=log_file,
        loglevel="INFO"
    )
    return logger_instance._init_logger()