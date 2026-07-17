"""
database/lock.py
Lock distribuído simples baseado em filesystem (O_CREAT | O_EXCL).
Funciona em Docker/Linux e Windows para coordenar processos/workers.
"""
import os
import time
import logging

_locks_dir = os.environ.get("LOCKS_DIR", "/app/data/locks")
try:
    os.makedirs(_locks_dir, exist_ok=True)
except Exception as e:
    logging.warning(f"⚠️ Não foi possível criar diretório de locks {_locks_dir}: {e}")


class DistributedLock:
    def __init__(self, lock_name: str, timeout: int = 300):
        self.lock_name = lock_name
        self.lock_path = os.path.join(_locks_dir, f"{lock_name}.lock")
        self.timeout = timeout
        self._fd = None
        self._locked = False

    def acquire(self, blocking: bool = True, timeout: int = -1) -> bool:
        effective_timeout = timeout if timeout >= 0 else self.timeout
        start = time.time()
        while True:
            try:
                self._fd = os.open(self.lock_path, os.O_CREAT | os.O_EXCL | os.O_RDWR)
                self._locked = True
                return True
            except FileExistsError:
                try:
                    # Se o arquivo do lock for mais velho que o timeout da classe, ele é um lock órfão (crash)
                    if time.time() - os.path.getmtime(self.lock_path) > self.timeout:
                        logging.warning(f"🧹 Removendo lock órfão/estagnado: {self.lock_path}")
                        try:
                            os.unlink(self.lock_path)
                        except FileNotFoundError:
                            pass
                        continue # Volta pro início do while para tentar adquirir novamente
                except Exception:
                    pass

                if not blocking:
                    return False
                if time.time() - start > effective_timeout:
                    logging.warning(f"⏳ Lock timeout: {self.lock_path}")
                    return False
                time.sleep(0.1)
            except Exception as e:
                logging.error(f"❌ Lock acquire error: {e}")
                return False

    def release(self) -> None:
        if self._fd is not None:
            try:
                os.close(self._fd)
            except Exception:
                pass
            self._fd = None
        self._locked = False
        try:
            os.unlink(self.lock_path)
        except FileNotFoundError:
            pass

    def locked(self) -> bool:
        return self._locked

    def __enter__(self):
        if not self.acquire():
            raise TimeoutError(f"Could not acquire lock: {self.lock_path}")
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.release()
