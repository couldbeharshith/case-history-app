class OperationError(Exception):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


class ClientDisconnected(Exception):
    pass


class InputExpired(OperationError):
    def __init__(self) -> None:
        super().__init__("The input request expired. Start the lookup again.")
