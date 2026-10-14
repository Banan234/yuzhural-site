export const MAX_SPECIFICATION_FILES = 3;
export const MAX_SPECIFICATION_FILE_BYTES = 5 * 1024 * 1024;
export const SPECIFICATION_ACCEPT = '.pdf,.xls,.xlsx';
export const SPECIFICATION_FILE_HINT =
  'PDF, XLS или XLSX · до 3 файлов, каждый до 5 МБ';
export function validateSpecificationFiles(files = []) {
  if (files.length > MAX_SPECIFICATION_FILES)
    return 'Можно прикрепить не больше 3 файлов.';
  if (files.some((file) => !/\.(pdf|xlsx?)$/i.test(file.name || '')))
    return 'Выберите спецификацию в формате PDF, XLS или XLSX.';
  if (
    files.some((file) => !file.size || file.size > MAX_SPECIFICATION_FILE_BYTES)
  )
    return 'Каждый файл должен быть непустым и не больше 5 МБ.';
  return '';
}
